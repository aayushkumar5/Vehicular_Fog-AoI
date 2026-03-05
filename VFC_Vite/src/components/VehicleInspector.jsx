import { PHASE, PC, PL } from "../lib/constants";
import { aoiColor } from "../lib/sim";

function Panel({ title, children, accent }) {
  return (
    <div style={{ background: "#07101c", borderRadius: 7, padding: "8px 10px", border: `1px solid ${accent || "#0c2030"}` }}>
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

export default function VehicleInspector({ selV, selRSU }) {
  if (!selV) {
    return (
      <div style={{ padding: 10, background: "#07101c", borderRadius: 7, border: "1px dashed #0d2535", fontSize: 9, color: "#1a3a55", textAlign: "center" }}>
        Click any vehicle<br />to inspect its state
      </div>
    );
  }

  // Decode action: 0=skip, 1..M=RSU index
  const actionLabel = selV.action === 0
    ? "0 — skip"
    : `${selV.action} → RSU-${selV.action}`;

  return (
    <Panel title={`🚗 ${selV.id} (Lane ${selV.lane})`} accent={PC[selV.phase]}>
      <SR label="Phase"        value={PL[selV.phase]}               color={PC[selV.phase]} />
      {/* Show both AoI values — Eq.14 raw and Eq.17 corrected */}
      <SR label="Δᵢ,ₕ  Eq.(14)" value={`${(selV.aoi_per_packet ?? selV.aoi).toFixed(4)}s`} color="#7dd3fc" />
      <SR label="Δᵢ   Eq.(17)" value={`${selV.aoi.toFixed(4)}s`}    color={aoiColor(selV.aoi)} />
      <SR label="β_ij"          value={selV.beta ? "1 ✓" : "0 ✗"}   color={selV.beta ? "#00ff88" : "#ff4466"} />
      <SR label="RSU"           value={selV.assignedRSU || "— none"} color={selRSU?.color || "#ff4466"} />
      <SR label="Q(s,a)"        value={selV.qValue?.toFixed(3) ?? "—"} color="#a78bfa" />
      <SR label="V(s)"          value={selV.vValue?.toFixed(3) ?? "—"} color="#7dd3fc" />
      {/* Fixed action label — shows which RSU was targeted */}
      <SR label="Action aₜ"    value={actionLabel}                  color={selV.action ? "#00ff88" : "#ff4466"} />
      <SR label="Speed v₀"     value={selV.speed?.toFixed(2) ?? "—"} color="#c4b5fd" />
      <SR label="λ"            value={selV.lambda?.toFixed(2) ?? "—"} color="#fbbf24" />
      <SR label="Reward rₜ"    value={(1 / (selV.aoi + 1e-6)).toFixed(2)} color="#00ff88" />
      <div style={{ marginTop: 6, padding: "5px 7px", background: "#040a10", borderRadius: 5, fontSize: 7.5, color: "#2a4560", lineHeight: 1.8 }}>
        {selV.phase === PHASE.OUT       && <div style={{ color: "#ff4466" }}>⚠ β=0 · d &gt; d_max · AoI rising</div>}
        {selV.phase === PHASE.ENTERING  && <div style={{ color: "#ffe066" }}>📡 V2I up · sending pos/speed/dir</div>}
        {selV.phase === PHASE.CANDIDATE && <div style={{ color: "#00aaff" }}>✓ Candidate · Eq.16+17 evaluating</div>}
        {selV.phase === PHASE.FOG       && <div style={{ color: "#00ff88" }}>🌫 Fog member · offloading active</div>}
        {selV.phase === PHASE.LEAVING   && <div style={{ color: "#ff8833" }}>🚪 β→0 · exiting RSU range</div>}
        {selV.reason && <div style={{ color: "#1a4060", marginTop: 2 }}>{selV.reason}</div>}
        <div style={{ marginTop: 2 }}>sₜ=[λ,μᵣ,μᵥ,Δ] · aₜ={selV.action ?? 0}</div>
      </div>
    </Panel>
  );
}
