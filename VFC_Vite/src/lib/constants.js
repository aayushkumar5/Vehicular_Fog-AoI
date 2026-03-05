// ── Canvas ────────────────────────────────────────────────────────
export const W          = 860;
export const H          = 480;
export const ROAD_TOP   = 140;
export const ROAD_BOT   = 340;
export const DIVIDER_Y  = (ROAD_TOP + ROAD_BOT) / 2;   // 240
export const LANE_A_Y   = ROAD_TOP + (DIVIDER_Y - ROAD_TOP) / 2;
export const LANE_B_Y   = DIVIDER_Y + (ROAD_BOT - DIVIDER_Y) / 2;

// ── Paper parameters ──────────────────────────────────────────────
export const D_MAX         = 115;   // coverage radius px
export const AOI_THRESHOLD = 0.08;  // optimal from paper §V (s)
export const CANDIDATE_R   = D_MAX * 0.78;
export const ERROR_RATE    = 0.10;  // ε

// ── 3 RSUs — moderate gap (slight overlap at edges) ───────────────
// Spacing: ~270px between centres, D_MAX=115 → ~15px overlap zone
export const RSUS = [
  { id: "r1", x: 155, y: DIVIDER_Y, mu: 12, color: "#00f5ff", label: "RSU-1" },
  { id: "r2", x: 430, y: DIVIDER_Y, mu: 10, color: "#ff6b35", label: "RSU-2" },
  { id: "r3", x: 705, y: DIVIDER_Y, mu: 11, color: "#a855f7", label: "RSU-3" },
];

// ── DDQN hyperparameters ──────────────────────────────────────────
export const GAMMA       = 0.99;
export const LR          = 0.003;
export const REPLAY_SIZE = 512;
export const BATCH_SIZE  = 32;
export const TARGET_SYNC = 60;
export const EPS_DECAY   = 0.9965;
export const EPS_MIN     = 0.05;

// ── Phase system ──────────────────────────────────────────────────
export const PHASE = {
  OUT:       "OUT",
  ENTERING:  "ENTERING",
  CANDIDATE: "CANDIDATE",
  FOG:       "FOG",
  LEAVING:   "LEAVING",
};
export const PC = {
  OUT:       "#ff4466",
  ENTERING:  "#ffe066",
  CANDIDATE: "#00aaff",
  FOG:       "#00ff88",
  LEAVING:   "#ff8833",
};
export const PL = {
  OUT:       "Out of Range",
  ENTERING:  "Entering",
  CANDIDATE: "Candidate",
  FOG:       "In Fog ✓",
  LEAVING:   "Leaving",
};
