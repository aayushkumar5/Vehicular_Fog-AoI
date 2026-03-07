// ── Canvas ────────────────────────────────────────────────────────
export const W = 860;
export const H = 480;
export const ROAD_TOP = 140;
export const ROAD_BOT = 340;
export const DIVIDER_Y = (ROAD_TOP + ROAD_BOT) / 2;   // 240
export const LANE_A_Y = ROAD_TOP + (DIVIDER_Y - ROAD_TOP) / 2;
export const LANE_B_Y = DIVIDER_Y + (ROAD_BOT - DIVIDER_Y) / 2;

// ── Paper parameters ──────────────────────────────────────────────
export const D_MAX = 115;   // coverage radius px
export const AOI_THRESHOLD = 0.08;  // optimal from paper §V (s)
export const CANDIDATE_R = D_MAX * 0.78;
export const ERROR_RATE = 0.05;  // ε — reduced from 0.10 for lower AoI

// ── 3 RSUs — moderate gap (slight overlap at edges) ───────────────
// Spacing: ~270px between centres, D_MAX=115 → ~15px overlap zone
// μᵣ values 30–36 — matched to λ=30–40 for AoI ≤ 0.08s
export const RSUS = [
  { id: "r1", x: 155, y: DIVIDER_Y, mu: 36, color: "#00f5ff", label: "RSU-1" },
  { id: "r2", x: 430, y: DIVIDER_Y, mu: 35, color: "#ff6b35", label: "RSU-2" },
  { id: "r3", x: 705, y: DIVIDER_Y, mu: 36, color: "#a855f7", label: "RSU-3" },
];

// ── DDQN hyperparameters ──────────────────────────────────────────
export const GAMMA = 0.99;      // discount factor, how much future rewards are valued vs immediate ones
export const LR = 0.003;     // learning rate, how much the model updates its weights based on the error
export const REPLAY_SIZE = 512;       // size of the replay buffer, how many past experiences the model can learn from
export const BATCH_SIZE = 32;        // number of experiences to learn from at once
export const TARGET_SYNC = 60;        // how often to update the target network
export const EPS_DECAY = 0.9965;    // decay rate for epsilon, how quickly the model stops exploring
export const EPS_MIN = 0.05;      // minimum value of epsilon, how quickly the model stops exploring

// ── Phase system ──────────────────────────────────────────────────
export const PHASE = {
  OUT: "OUT",
  ENTERING: "ENTERING",
  CANDIDATE: "CANDIDATE",
  FOG: "FOG",
  LEAVING: "LEAVING",
};
export const PC = {
  OUT: "#ff4466",
  ENTERING: "#ffe066",
  CANDIDATE: "#00aaff",
  FOG: "#00ff88",
  LEAVING: "#ff8833",
};
export const PL = {
  OUT: "Out of Range",
  ENTERING: "Entering",
  CANDIDATE: "Candidate",
  FOG: "In Fog ✓",
  LEAVING: "Leaving",
};
