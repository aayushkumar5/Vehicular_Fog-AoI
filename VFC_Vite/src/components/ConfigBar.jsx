const VEHICLE_OPTIONS = [6, 8, 10, 15, 20, 30, 40, 50];
const THRESHOLD_OPTIONS = [0.04, 0.06, 0.08, 0.10];

export default function ConfigBar({ numVeh, aoiThr, onVehicles, onThr }) {
  return (
    <div style={{
      display: "flex", gap: 20, marginBottom: 10, padding: "7px 12px",
      background: "#070d18", borderRadius: 8, border: "1px solid #0c2030",
      alignItems: "center", flexWrap: "wrap"
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <span style={{ fontSize: 8.5, color: "#2a4a60" }}>Vehicles (N):</span>
        {VEHICLE_OPTIONS.map(n => (
          <button key={n} onClick={() => onVehicles(n)} style={{
            background: numVeh === n ? "#0c2236" : "#060d18",
            border: `1px solid ${numVeh === n ? "#00f5ff" : "#1a2a40"}`,
            color: numVeh === n ? "#00f5ff" : "#2a4a60",
            padding: "2px 7px", borderRadius: 4, cursor: "pointer",
            fontSize: 8.5, fontFamily: "monospace"
          }}>{n}</button>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <span style={{ fontSize: 8.5, color: "#2a4a60" }}>AoI Threshold:</span>
        {THRESHOLD_OPTIONS.map(t => (
          <button key={t} onClick={() => onThr(t)} style={{
            background: aoiThr === t ? "#071a0d" : "#060d18",
            border: `1px solid ${aoiThr === t ? "#00ff88" : "#1a2a40"}`,
            color: aoiThr === t ? "#00ff88" : "#2a4a60",
            padding: "2px 7px", borderRadius: 4, cursor: "pointer",
            fontSize: 8.5, fontFamily: "monospace"
          }}>{t}s</button>
        ))}
        <span style={{ fontSize: 8, color: "#1a3a4a" }}>(paper optimal: 0.08s)</span>
      </div>
    </div>
  );
}
