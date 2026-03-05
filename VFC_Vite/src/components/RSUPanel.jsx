import { RSUS, PHASE, PC } from "../lib/constants";
import { aoiColor } from "../lib/sim";
import Sparkline from "./Sparkline";

// ── RSU Activity Logs ─────────────────────────────────────────────
export default function RSUPanel({ rsuLogs, vehicles }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${RSUS.length},1fr)`, gap: 8, marginTop: 8 }}>
      {RSUS.map(rsu => {
        const fogN = vehicles.filter(v => v.phase === PHASE.FOG && v.assignedRSU === rsu.id).length;
        const candN = vehicles.filter(v => v.phase === PHASE.CANDIDATE && v.assignedRSU === rsu.id).length;
        return (
          <div key={rsu.id} style={{
            background: "#070e18", borderRadius: 7,
            border: `1px solid ${rsu.color}28`, padding: "7px 9px"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
              <span style={{ fontSize: 8, color: rsu.color, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 700 }}>
                📡 {rsu.label}
              </span>
              <span style={{ fontSize: 7.5, color: "#3a5a70" }}>
                <span style={{ color: "#00ff88" }}>fog:{fogN}</span>
                {" · "}
                <span style={{ color: "#00aaff" }}>cand:{candN}</span>
              </span>
            </div>
            {(rsuLogs[rsu.id] || []).length === 0
              ? <div style={{ fontSize: 7.5, color: "#1a3a50" }}>Waiting for vehicles…</div>
              : (rsuLogs[rsu.id] || []).map((e, i) => (
                <div key={i} style={{ fontSize: 7.5, color: e.color, marginBottom: 2, opacity: 1 - i * 0.18, lineHeight: 1.5 }}>
                  ▸ {e.msg}
                </div>
              ))
            }
          </div>
        );
      })}
    </div>
  );
}

// ── Stats Panel (right sidebar) ───────────────────────────────────
export function StatsPanel({ episode, step, epsilon, bufSize, avgRew, avgAoI, avgLoss, aoiThr, fogTotal, vehicles, rewardH, aoiH, lossH }) {
  return (
    <>
      <Panel title="🤖 DRL Agent">
        <SR label="Episode"     value={episode}                    color="#00f5ff" />
        <SR label="Step"        value={step}                       color="#7dd3fc" />
        <SR label="ε-greedy"    value={epsilon.toFixed(3)}         color="#a78bfa" />
        <SR label="Buffer"      value={`${bufSize}/512`}           color="#fbbf24" />
        <SR label="Target sync" value="every 60 steps"            color="#2a5a70" />
        <div style={{ marginTop: 5 }}>
          <div style={{ fontSize: 7.5, color: "#1a3a50", marginBottom: 2 }}>Explore → Exploit</div>
          <div style={{ background: "#060e18", borderRadius: 3, height: 5, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${epsilon * 100}%`, background: "linear-gradient(90deg,#a78bfa,#00f5ff)", transition: "width 0.5s" }} />
          </div>
        </div>
      </Panel>

      <Panel title="📈 Reward  rₜ = 1/Δᵢ">
        <SR label="Current" value={avgRew.toFixed(2)} color="#00ff88" />
        <Sparkline data={rewardH} color="#00ff88" />
      </Panel>

      <Panel title="📉 Avg AoI">
        <SR label="AoI"       value={`${avgAoI.toFixed(4)}s`} color={aoiColor(avgAoI, aoiThr)} />
        <SR label="Threshold" value={`${aoiThr}s`}            color="#1a3a50" />
        <Sparkline data={aoiH} color="#ff6b35" />
      </Panel>

      <Panel title="⚡ TD Loss  L(θ)=(y−Q)²">
        <SR label="Loss" value={avgLoss.toFixed(4)}
          color={avgLoss > 0.1 ? "#ff4466" : avgLoss > 0.01 ? "#ffe066" : "#00ff88"} />
        <Sparkline data={lossH} color="#ff4466" />
        <div style={{ fontSize: 7.5, color: "#1a3a50", marginTop: 3 }}>Buffer fills → training starts</div>
      </Panel>

      <Panel title="🌫️ Fog Formation">
        <SR label="In Fog"   value={`${fogTotal} / ${vehicles.length}`} color="#00ff88" />
        <SR label="AoI thr." value={`${aoiThr}s`}                       color="#1a3a50" />
        {RSUS.map(rsu => {
          const fA = vehicles.filter(v => v.lane === "A" && v.phase === PHASE.FOG && v.assignedRSU === rsu.id).length;
          const fB = vehicles.filter(v => v.lane === "B" && v.phase === PHASE.FOG && v.assignedRSU === rsu.id).length;
          return (
            <div key={rsu.id} style={{ marginTop: 4, padding: "3px 6px", background: "#060d18", borderRadius: 4, border: `1px solid ${rsu.color}22` }}>
              <span style={{ fontSize: 8, color: rsu.color, fontWeight: 700 }}>{rsu.label}: </span>
              <span style={{ fontSize: 8, color: "#00ff88" }}>A:{fA} B:{fB}</span>
            </div>
          );
        })}
      </Panel>
    </>
  );
}

// ── Shared sub-components ─────────────────────────────────────────
function Panel({ title, children, accent }) {
  return (
    <div style={{ background: "#07101c", borderRadius: 7, padding: "8px 10px", border: `1px solid ${accent || "#0c2030"}`, marginBottom: 8 }}>
      <div style={{ fontSize: 8, color: "#1a3a55", marginBottom: 5, letterSpacing: 1.2, textTransform: "uppercase" }}>{title}</div>
      {children}
    </div>
  );
}
function SR({ label, value, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
      <span style={{ fontSize: 8, color: "#2a4560" }}>{label}</span>
      <span style={{ fontSize: 9, fontWeight: 700, color: color || "#b8cce0", fontFamily: "monospace" }}>{value}</span>
    </div>
  );
}
