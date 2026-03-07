import { RSUS, DIVIDER_Y, LANE_A_Y, LANE_B_Y, PHASE, ERROR_RATE } from "./constants";

export const rand = (a, b) => a + Math.random() * (b - a);
export const dist = (x1, y1, x2, y2) => Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
export const aoiColor = (a, thr = 0.08) =>
  a < 0.05 ? "#00ff88" : a < thr ? "#ffe066" : "#ff4466";

// Equation (14) — SHS AoI per packet [FIXED t3 denominator]
export function calcAoI(lambda, mu_r, eps = ERROR_RATE) {
  const t1 = 1 / ((1 - eps) * lambda);
  const t2 = 1 / ((1 - eps) * mu_r);
  const t3 = lambda / (mu_r * (lambda + mu_r));  // FIXED: was λμᵣε/(λ+μᵣ)
  return t1 + t2 + t3;
}

// State vector — sₜ = [λ(N), μ_r(M), μ_v(N), Δ(N)]
export function buildState(vehicles, N = 15) {
  const padded = [...vehicles];
  while (padded.length < N) padded.push({ lambda: 0, aoi: 0 });
  return [
    ...padded.slice(0, N).map(v => v.lambda / 50),
    ...RSUS.map(r => r.mu / 50),
    ...padded.slice(0, N).map(v => (v.mu_v || 6.0) / 10),
    ...padded.slice(0, N).map(v => v.aoi / 0.28),
  ];
}

// Initialise vehicles with CSM parameters
export function initVehicles(n = 10) {
  return Array.from({ length: n }, (_, i) => {
    const isA = i < Math.ceil(n / 2);
    return {
      id: `V${i + 1}`,
      lane: isA ? "A" : "B",
      x: isA ? rand(20, 430) : rand(430, 840),
      y: isA ? LANE_A_Y + rand(-5, 5) : LANE_B_Y + rand(-5, 5),
      dir: isA ? 1 : -1,
      speed: rand(1.5, 2.8),
      lambda: rand(30, 40),
      mu_v:   rand(4, 8),     // ← missing
      //aoi:    rand(0.04, 0.18),
      aoi_per_packet: 0,
      beta: 0,
      phase: PHASE.OUT,
      assignedRSU: null,
      leavingTimer: 0,
      trail: [],
      qValue: 0,
      vValue: 0,
      action: 0,
    };
  });
}
