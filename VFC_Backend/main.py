"""
VFC Dueling DDQN — FastAPI WebSocket Backend
Endpoint: ws://localhost:8000/ws

Flow per tick:
  1. Receive vehicle data from frontend (JSON)
  2. Compute AoI + β_ij (environment.py)
  3. Build state vector
  4. DDQN forward pass → actions, Q-values
  5. Accept/Reject per vehicle (AoI ≤ threshold check)
  6. Push to replay buffer
  7. Train online network (Double Q-Learning)
  8. Send results back to frontend
"""

import json
import asyncio
import os
import time
from typing import Optional, Tuple, List
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from ddqn import DuelingDDQN
from environment import (
    VehicleInput, RSUConfig, VehicleResult,
    build_state_vector, compute_reward, process_vehicles,
    calc_aoi_final, find_best_rsu,
    MAX_N, NUM_RSUS,
)

# ── App setup ─────────────────────────────────────────────────────
app = FastAPI(title="VFC Dueling DDQN Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # allow React dev server
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Checkpoint path resolution ─────────────────────────────────────
MODEL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "saved_models")
os.makedirs(MODEL_DIR, exist_ok=True)
CKPT_PATH = os.path.join(MODEL_DIR, "dueling_ddqn_checkpoint.pth")

# ── Global agent (one per server instance) ────────────────────────
STATE_DIM  = MAX_N + NUM_RSUS + MAX_N + MAX_N
# FIX Issue 5: 0=skip, 1..M=target RSU — (NUM_RSUS+1) choices per vehicle
ACTION_DIM = MAX_N * (NUM_RSUS + 1)

agent = DuelingDDQN(
    state_dim   = STATE_DIM,
    action_dim  = ACTION_DIM,
    hidden      = 128,
    lr          = 3e-3,
    gamma       = 0.99,
    eps_start   = 1.0,
    eps_min     = 0.05,
    eps_decay   = 0.9965,
    target_sync = 60,
    batch_size  = 32,
    buffer_size = 512,
)

# Try to load a pre-trained checkpoint on startup
agent.load(CKPT_PATH)

# Track previous state for replay buffer
prev_state:  Optional[np.ndarray] = None
episode_num: int = 1
step_num:    int = 0

# Rate limiting
MIN_MSG_INTERVAL = 0.01  # 10ms minimum between messages


# ── Helper: parse incoming message ────────────────────────────────
def parse_message(data: dict) -> Tuple[List[VehicleInput], List[RSUConfig], float]:
    vehicles = [
        VehicleInput(
            id          = v["id"],
            x           = float(v["x"]),
            y           = float(v["y"]),
            speed       = float(v["speed"]),
            direction   = int(v["direction"]),
            lane        = v["lane"],
            lambda_rate = float(v["lambda"]),
            mu_v        = float(v.get("mu_v", 6.0)),
        )
        for v in data.get("vehicles", [])
    ]
    rsus = [
        RSUConfig(
            id   = r["id"],
            x    = float(r["x"]),
            y    = float(r["y"]),
            mu_r = float(r["mu_r"]),
        )
        for r in data.get("rsu_positions", [])
    ]
    threshold = float(data.get("aoi_threshold", 0.08))
    return vehicles, rsus, threshold


# ── WebSocket endpoint ────────────────────────────────────────────
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    global prev_state, episode_num, step_num

    await websocket.accept()
    print("[WS] Client connected")

    last_msg_time = 0.0

    try:
        while True:
            # Rate limiting
            now = time.monotonic()
            elapsed = now - last_msg_time
            if elapsed < MIN_MSG_INTERVAL:
                await asyncio.sleep(MIN_MSG_INTERVAL - elapsed)
            last_msg_time = time.monotonic()

            # 1. Receive vehicle data from frontend
            raw = await websocket.receive_text()
            data = json.loads(raw)

            vehicles, rsus, aoi_threshold = parse_message(data)

            # FIX: Reset prev_state on episode change to prevent cross-episode transitions
            new_episode = data.get("episode", episode_num)
            episode_changed = new_episode != episode_num

            if episode_changed and prev_state is not None:
                # Push terminal transition for previous episode (done=True)
                agent.push(
                    s      = prev_state,
                    a      = 0,
                    r      = 0.0,
                    s_next = prev_state,
                    done   = True,
                )
                prev_state = None
                print(f"[DDQN] Episode {episode_num} → {new_episode}")

            episode_num = new_episode
            step_num   += 1

            if not vehicles or not rsus:
                continue

            # 2. Compute AoI for each vehicle + build state vector
            aoi_map = {}
            for v in vehicles:
                best_rsu, _ = find_best_rsu(v.x, v.y, rsus)
                aoi_map[v.id] = calc_aoi_final(v.lambda_rate, best_rsu.mu_r) if best_rsu else 0.28

            state = build_state_vector(vehicles, rsus, aoi_map)

            # 3. DDQN forward pass → ε-greedy actions
            all_actions, all_q_values, v_value = agent.select_actions(state)

            # Decode flat action vector into per-vehicle RSU choice
            # Each vehicle has (NUM_RSUS+1) action slots in the Q-network
            num_choices = NUM_RSUS + 1
            actions  = []
            q_values = []
            for vi in range(len(vehicles)):
                slot_start = vi * num_choices
                slot_end   = slot_start + num_choices
                vehicle_qs = all_q_values[slot_start:slot_end]
                if not vehicle_qs:
                    actions.append(0)
                    q_values.append(0.0)
                    continue
                # ε-greedy over the vehicle's (NUM_RSUS+1) choices
                if len(all_actions) > vi and all_actions[vi] < num_choices:
                    best_slot = all_actions[vi]
                else:
                    best_slot = int(vehicle_qs.index(max(vehicle_qs)))
                actions.append(best_slot)        # 0=skip, 1..M=RSU index
                q_values.append(max(vehicle_qs))

            # 4. Accept/Reject per vehicle — Eq.(19a,b) + Eq.(16,17)
            results = process_vehicles(
                vehicles, rsus, aoi_threshold,
                actions, q_values, v_value,
            )

            # 5. Compute reward — Eq.(20)
            reward = compute_reward(results)

            # 6. FIX: Push CORRECT action to replay buffer (flat action index, not vehicle loop index)
            if prev_state is not None:
                for i, vi in enumerate(range(len(vehicles))):
                    flat_action = vi * num_choices + actions[i]
                    flat_action = min(flat_action, ACTION_DIM - 1)
                    agent.push(
                        s      = prev_state,
                        a      = flat_action,
                        r      = reward,
                        s_next = state,
                        done   = False,
                    )
            prev_state = state.copy()

            # 7. Train — Double Q-Learning Eq.(22) + Loss Eq.(23)
            loss = agent.train_step()

            # 8. Periodic checkpoint save
            if step_num % 500 == 0:
                agent.save(CKPT_PATH)
                print(f"[DDQN] Step {step_num} · ε={agent.eps:.3f} · loss={loss:.4f}")

            # 9. Build response
            fog_members      = [r.id for r in results if r.status == "ACCEPTED"]
            rejected_ids     = [r.id for r in results if r.status == "REJECTED"]
            out_of_range_ids = [r.id for r in results if r.status == "OUT_OF_RANGE"]

            avg_aoi = sum(r.aoi for r in results) / len(results) if results else 0

            response = {
                "episode":         episode_num,
                "step":            step_num,
                "epsilon":         round(agent.eps, 4),
                "avg_aoi":         round(avg_aoi, 4),
                "avg_reward":      round(reward, 4),
                "loss":            round(loss, 6),
                "buffer_size":     len(agent.buffer),
                "fog_members":     fog_members,
                "rejected":        rejected_ids,
                "out_of_range":    out_of_range_ids,
                "vehicles": [
                    {
                        "id":             r.id,
                        "aoi":            round(r.aoi, 4),           # Eq.(17) final
                        "aoi_per_packet": round(r.aoi_per_packet, 4),# Eq.(14) raw
                        "beta":           r.beta,
                        "assigned_rsu":   r.assigned_rsu,
                        "distance":       round(r.distance, 1),
                        "status":         r.status,
                        "reason":         r.reason,
                        "action":         r.action,
                        "q_value":        round(r.q_value, 4),
                        "v_value":        round(r.v_value, 4),
                        "phase":          r.phase,
                    }
                    for r in results
                ],
            }

            await websocket.send_text(json.dumps(response))

    except WebSocketDisconnect:
        print("[WS] Client disconnected — saving checkpoint")
        agent.save(CKPT_PATH)

    except Exception as e:
        print(f"[WS] Error: {e}")
        try:
            await websocket.send_text(json.dumps({"error": str(e)}))
        except Exception:
            pass


# ── REST endpoints (optional — health check, manual save) ─────────
@app.get("/")
def root():
    return {
        "status":     "running",
        "step":       step_num,
        "epsilon":    round(agent.eps, 4),
        "buffer":     len(agent.buffer),
        "device":     str(next(agent.online.parameters()).device),
    }

@app.post("/save")
def save_checkpoint():
    agent.save(CKPT_PATH)
    return {"saved": True, "step": step_num}

@app.post("/reset")
def reset_agent():
    global prev_state, step_num, agent
    prev_state = None
    step_num   = 0
    # FIX: Create a new agent instead of calling __init__ directly (avoids PyTorch memory leak)
    agent = DuelingDDQN(
        state_dim   = STATE_DIM,
        action_dim  = ACTION_DIM,
        hidden      = 128,
        lr          = 3e-3,
        gamma       = 0.99,
        eps_start   = 1.0,
        eps_min     = 0.05,
        eps_decay   = 0.9965,
        target_sync = 60,
        batch_size  = 32,
        buffer_size = 512,
    )
    return {"reset": True}
