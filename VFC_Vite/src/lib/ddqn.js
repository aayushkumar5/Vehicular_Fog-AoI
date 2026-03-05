import { LR } from "./constants";

// ── Math helpers ─────────────────────────────────────────────────
function mulberry32(seed) {
  let s = seed;
  return () => {
    s |= 0; s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function heWeights(fanIn, fanOut, seed = 1) {
  const std = Math.sqrt(2 / fanIn), rng = mulberry32(seed);
  return Array.from({ length: fanOut }, () =>
    Array.from({ length: fanIn }, () => (rng() * 2 - 1) * std)
  );
}
function zeros(n) { return new Array(n).fill(0); }
function linear(x, W, b) {
  return b.map((bi, i) => W[i].reduce((s, w, j) => s + w * x[j], bi));
}
function relu(v) { return v.map(x => Math.max(0, x)); }

// ── Dueling DDQN Network ─────────────────────────────────────────
// Implements Equation (21): Q(s,a;θ) = V(s;θ) + [A(s,a;θ) − mean(A)]
export class DuelingDDQN {
  constructor(stateDim, actionDim, hidden = 128, seed = 42) {
    this.stateDim  = stateDim;
    this.actionDim = actionDim;

    // Shared backbone layers
    this.sw1 = heWeights(stateDim, hidden, seed);     this.sb1 = zeros(hidden);
    this.sw2 = heWeights(hidden, hidden, seed + 1);   this.sb2 = zeros(hidden);

    // Value stream V(s) → scalar
    this.vw1 = heWeights(hidden, 64, seed + 2);       this.vb1 = zeros(64);
    this.vw2 = heWeights(64, 1, seed + 3);            this.vb2 = zeros(1);

    // Advantage stream A(s,a) → actionDim values
    this.aw1 = heWeights(hidden, 64, seed + 4);       this.ab1 = zeros(64);
    this.aw2 = heWeights(64, actionDim, seed + 5);    this.ab2 = zeros(actionDim);
  }

  // Forward pass — returns Q, V, A
  forward(state) {
    // Shared
    let h = relu(linear(state, this.sw1, this.sb1));
    h      = relu(linear(h,    this.sw2, this.sb2));
    // Value stream
    let v  = relu(linear(h, this.vw1, this.vb1));
    const V = linear(v, this.vw2, this.vb2)[0];
    // Advantage stream
    let a  = relu(linear(h, this.aw1, this.ab1));
    const A = linear(a, this.aw2, this.ab2);
    const meanA = A.reduce((s, x) => s + x, 0) / A.length;
    // Eq.(21)
    const Q = A.map(ai => V + (ai - meanA));
    return { Q, V, A, meanA };
  }

  // Lightweight SGD on advantage stream weights
  trainStep(state, actionIdx, tdError) {
    const gradScale = 0.01;
    this.aw2 = this.aw2.map((row, i) =>
      row.map((w, j) => w - LR * (-2 * tdError * (state[j] || 0)) * gradScale)
    );
    this.ab2 = this.ab2.map(b => b - LR * (-2 * tdError) * gradScale);
  }

  // Copy weights θ → θ' (target network update)
  copyWeightsFrom(src) {
    const cp = m => m.map(r => [...r]);
    this.sw1 = cp(src.sw1); this.sb1 = [...src.sb1];
    this.sw2 = cp(src.sw2); this.sb2 = [...src.sb2];
    this.vw1 = cp(src.vw1); this.vb1 = [...src.vb1];
    this.vw2 = cp(src.vw2); this.vb2 = [...src.vb2];
    this.aw1 = cp(src.aw1); this.ab1 = [...src.ab1];
    this.aw2 = cp(src.aw2); this.ab2 = [...src.ab2];
  }
}

// ── Experience Replay Buffer ─────────────────────────────────────
// Circular ring buffer storing (s, a, r, s', done) tuples
export class ReplayBuffer {
  constructor(capacity = 512) {
    this.buf = []; this.cap = capacity; this.ptr = 0;
  }
  push(exp) {
    if (this.buf.length < this.cap) this.buf.push(exp);
    else { this.buf[this.ptr] = exp; this.ptr = (this.ptr + 1) % this.cap; }
  }
  sample(n = 32) {
    const out = [];
    for (let i = 0; i < Math.min(n, this.buf.length); i++)
      out.push(this.buf[Math.floor(Math.random() * this.buf.length)]);
    return out;
  }
  get size() { return this.buf.length; }
}
