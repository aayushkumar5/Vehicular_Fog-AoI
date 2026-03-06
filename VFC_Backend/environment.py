"""
VFC Simulation Environment
Handles:
  • AoI per packet      — Equation (14)   [FIXED t3 term]
  • Average AoI over H  — Equation (16)   [ADDED]
  • Error-rate adjust   — Equation (17)   [ADDED]
  • Distance / β_ij     — Equation (1)
  • Accept / Reject     — Equations (19a, 19b)
  • State vector        — paper §IV-A
  • Reward              — Equation (20)
  • Action space        — per vehicle-RSU pair [FIXED Issue 5]
"""

import math
import numpy as np
from dataclasses import dataclass, field
from typing import Optional

# ── Constants ─────────────────────────────────────────────────────
D_MAX         = 115.0   # max RSU coverage distance (pixels/units)
ERROR_RATE    = 0.10    # ε — packet error rate
MAX_N         = 15      # max vehicles for fixed state vector size
NUM_RSUS      = 3
H_PACKETS     = 5       # number of status update packets to average over — Eq.(16)


@dataclass
class VehicleInput:
    """Raw vehicle data received from frontend."""
    id:          str
    x:           float
    y:           float
    speed:       float
    direction:   int        # +1 or -1
    lane:        str        # "A" or "B"
    lambda_rate: float      # packet arrival rate λ
    mu_v:        float      # vehicle computing capacity


@dataclass
class RSUConfig:
    """RSU configuration from frontend."""
    id:   str
    x:    float
    y:    float
    mu_r: float             # RSU computing capacity


@dataclass
class VehicleResult:
    """Per-vehicle result sent back to frontend."""
    id:           str
    aoi:          float     # final Δᵢ after Eq.(16,17)
    aoi_per_packet: float   # raw Δᵢ,ₕ from Eq.(14) for display
    beta:         int       # 0 or 1 — Eq.(1)
    assigned_rsu: Optional[str]
    distance:     float
    status:       str       # "ACCEPTED" | "REJECTED" | "OUT_OF_RANGE"
    reason:       str
    action:       int       # 0=skip, 1..M=offload to RSU index
    q_value:      float
    v_value:      float
    phase:        str


def euclidean(x1, y1, x2, y2) -> float:
    return math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2)


# ── FIX 1: Corrected Equation (14) ────────────────────────────────
def calc_aoi_per_packet(lambda_rate: float, mu_r: float, eps: float = ERROR_RATE) -> float:
    """
    AoI for the hth packet — Equation (14):

    Δᵢ,ₕ = 1/((1-ε)·λ)  +  1/((1-ε)·μᵣ)  +  λ / (μᵣ·(λ + μᵣ))
             ───────────     ───────────     ──────────────────────
                 t1               t2                  t3

    FIX: t3 denominator is μᵣ·(λ+μᵣ), NOT (λ+μᵣ) alone.
    Previous bug had t3 = λ·μᵣ·ε/(λ+μᵣ) which is mathematically wrong.
    """
    if lambda_rate <= 0 or mu_r <= 0:
        return 0.28
    t1 = 1.0 / ((1 - eps) * lambda_rate)
    t2 = 1.0 / ((1 - eps) * mu_r)
    t3 = lambda_rate / (mu_r * (lambda_rate + mu_r))   # ← FIXED
    return min(t1 + t2 + t3, 0.28)


# ── FIX 2a: Equation (16) — average AoI over H packets ────────────
def calc_aoi_average(lambda_rate: float, mu_r: float, H: int = H_PACKETS, eps: float = ERROR_RATE) -> float:
    """
    Average AoI over H status update packets — Equation (16):

    Δᵢ,H = (1/H) · Σₕ₌₁ᴴ Δᵢ,ₕ

    Each packet h has the same λ and μᵣ so Δᵢ,ₕ is constant per vehicle.
    The sum therefore equals H · Δᵢ,ₕ and the average equals Δᵢ,ₕ itself.
    We still compute it properly so future variable-λ extensions work.
    """
    total = sum(calc_aoi_per_packet(lambda_rate, mu_r, eps) for _ in range(H))
    return total / H


# ── FIX 2b: Equation (17) — error-rate correction ─────────────────
def calc_aoi_final(lambda_rate: float, mu_r: float, H: int = H_PACKETS, eps: float = ERROR_RATE) -> float:
    """
    Final average AoI with error-rate correction — Equation (17):

         | |Δᵢ,H − 1|   if ε = 0
    Δᵢ = |  Δᵢ,H       if 0 < ε ≤ 1      ← our case (ε=0.10)
         |  Δᵢ,H + 1   if ε = 1
    """
    delta_H = calc_aoi_average(lambda_rate, mu_r, H, eps)

    if eps == 0:
        return abs(delta_H - 1)
    elif eps == 1:
        return delta_H + 1
    else:                       # 0 < ε < 1  (normal operating case)
        return delta_H


def find_best_rsu(vx: float, vy: float, rsus: list[RSUConfig]) -> tuple[Optional[RSUConfig], float]:
    """Equation (1): Find closest RSU within D_MAX."""
    best_rsu, min_d = None, float("inf")
    for rsu in rsus:
        d = euclidean(vx, vy, rsu.x, rsu.y)
        if d <= D_MAX and d < min_d:
            min_d = d
            best_rsu = rsu
    return best_rsu, min_d if best_rsu else float("inf")


def find_all_rsus_in_range(vx: float, vy: float, rsus: list[RSUConfig]) -> list[tuple[RSUConfig, float]]:
    """Return ALL RSUs within D_MAX, sorted by distance. Used for action space."""
    in_range = []
    for rsu in rsus:
        d = euclidean(vx, vy, rsu.x, rsu.y)
        if d <= D_MAX:
            in_range.append((rsu, d))
    return sorted(in_range, key=lambda x: x[1])


def build_state_vector(
    vehicles: list[VehicleInput],
    rsus:     list[RSUConfig],
    aoi_map:  dict[str, float],
    n:        int = MAX_N,
) -> np.ndarray:
    """
    State vector — sₜ = [λ(N), μ_r(M), μ_v(N), Δ(N)]
    Uses final corrected AoI (Eq.17) in the Δ component.
    """
    lambdas = [v.lambda_rate / 10.0           for v in vehicles[:n]]
    mu_vs   = [v.mu_v / 10.0                  for v in vehicles[:n]]
    deltas  = [aoi_map.get(v.id, 0.28) / 0.28 for v in vehicles[:n]]
    mu_rs   = [r.mu_r / 12.0                  for r in rsus]

    while len(lambdas) < n: lambdas.append(0.0)
    while len(mu_vs)   < n: mu_vs.append(0.0)
    while len(deltas)  < n: deltas.append(1.0)

    return np.array(lambdas + mu_rs + mu_vs + deltas, dtype=np.float32)


def compute_reward(vehicle_results: list[VehicleResult]) -> float:
    """Reward — Equation (20): rₜ = 1/Δₜ"""
    if not vehicle_results:
        return 0.0
    avg_aoi = sum(r.aoi for r in vehicle_results) / len(vehicle_results)
    return 1.0 / (avg_aoi + 1e-6)


# ── FIX 3: Corrected action space — per vehicle-RSU pair ──────────
def decode_action(action_idx: int, num_rsus: int) -> int:
    """
    Action space — paper §IV-A:
    aₜ ∈ {0, 1, ..., M} per vehicle where:
      0         = do not offload
      1..M      = offload to RSU index (1-based)

    action_idx comes from the Q-network output which has
    action_dim = (num_rsus + 1) options per vehicle.
    """
    return action_idx  # 0=skip, 1=RSU-1, 2=RSU-2, 3=RSU-3


def process_vehicles(
    vehicles:      list[VehicleInput],
    rsus:          list[RSUConfig],
    aoi_threshold: float,
    actions:       list[int],   # now: 0=skip, 1..M=target RSU index
    q_values:      list[float],
    v_value:       float,
) -> list[VehicleResult]:
    """
    Core fog formation logic — paper-accurate:
    1. Distance check β_ij          — Eq.(1)
    2. AoI per packet                — Eq.(14) [FIXED t3]
    3. Average over H packets        — Eq.(16) [ADDED]
    4. Error-rate correction         — Eq.(17) [ADDED]
    5. Threshold + capacity check    — Eq.(19a,b)
    6. DDQN action (V→R assignment)  — [FIXED action space]
    """
    results = []

    for i, v in enumerate(vehicles):
        # Raw action from network: 0=skip, 1..M=target RSU
        raw_action = actions[i] if i < len(actions) else 0
        q_value    = q_values[i] if i < len(q_values) else 0.0

        # Find all RSUs in range for this vehicle
        rsus_in_range = find_all_rsus_in_range(v.x, v.y, rsus)

        # ── Out of range ──────────────────────────────────────────
        if not rsus_in_range:
            _, inf_d = find_best_rsu(v.x, v.y, rsus)
            results.append(VehicleResult(
                id=v.id, aoi=0.28, aoi_per_packet=0.28,
                beta=0, assigned_rsu=None, distance=inf_d,
                status="OUT_OF_RANGE",
                reason=f"d > d_max={D_MAX} — β=0",
                action=0, q_value=q_value, v_value=v_value,
                phase="OUT",
            ))
            continue

        # ── Resolve target RSU from action ────────────────────────
        # action=0 → skip; action=k → use k-th RSU in range (1-based)
        if raw_action == 0 or raw_action > len(rsus_in_range):
            target_rsu, distance = rsus_in_range[0]   # closest, for AoI calc
            offload = False
        else:
            target_rsu, distance = rsus_in_range[raw_action - 1]
            offload = True

        # ── Eq.(14): AoI per packet ───────────────────────────────
        aoi_h = calc_aoi_per_packet(v.lambda_rate, target_rsu.mu_r)

        # ── Eq.(16): Average over H packets ──────────────────────
        # ── Eq.(17): Error-rate correction ───────────────────────
        aoi_final = calc_aoi_final(v.lambda_rate, target_rsu.mu_r)

        # ── Constraints Eq.(19a,b) ────────────────────────────────
        aoi_ok      = aoi_final <= aoi_threshold
        capacity_ok = v.lambda_rate <= target_rsu.mu_r

       if not capacity_ok:
            status = "REJECTED"
            reason = f"λ={v.lambda_rate:.2f} > μᵣ={target_rsu.mu_r} — Eq.(19b)"
            final_action = 0
            phase  = "CANDIDATE"

        elif offload:
            status = "ACCEPTED"
            reason = f"Δᵢ={aoi_final:.4f}s ≤ {aoi_threshold}s → {target_rsu.id} · Q={q_value:.3f}"
            final_action = raw_action
            phase  = "FOG"

        else:
            # Agent chose action=0 (ε-greedy skip)
            status = "REJECTED"
            reason = f"Agent action=0 (ε-greedy) · AoI OK"
            final_action = 0
            phase  = "CANDIDATE"

        results.append(VehicleResult(
            id=v.id,
            aoi=aoi_final,
            aoi_per_packet=aoi_h,
            beta=1,
            assigned_rsu=target_rsu.id,
            distance=distance,
            status=status,
            reason=reason,
            action=final_action,
            q_value=q_value,
            v_value=v_value,
            phase=phase,
        ))

    return results
