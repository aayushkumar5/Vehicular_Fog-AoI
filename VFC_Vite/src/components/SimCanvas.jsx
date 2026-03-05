import { RSUS, PHASE, PC, PL, D_MAX, CANDIDATE_R, W, H, ROAD_TOP, ROAD_BOT, DIVIDER_Y, LANE_A_Y, LANE_B_Y } from "../lib/constants";
import { aoiColor } from "../lib/sim";

export default function SimCanvas({ vehicles, showCov, selected, phaseCounts, aoiThr, onSelect, onDeselect }) {
  return (
    <svg
      width={W} height={H}
      viewBox={`0 0 ${W} ${H}`}
      style={{ background: "#06101a", borderRadius: 10, border: "1px solid #0c2030", display: "block", cursor: "crosshair", width: "100%" }}
      onClick={onDeselect}
    >
      {/* ── Road environment ── */}
      <rect x={0} y={0}        width={W} height={ROAD_TOP}         fill="#050b14" />
      <rect x={0} y={ROAD_BOT} width={W} height={H - ROAD_BOT}     fill="#050d07" />
      <rect x={0} y={ROAD_TOP} width={W} height={ROAD_BOT - ROAD_TOP} fill="#090f1c" />
      <line x1={0} y1={ROAD_TOP} x2={W} y2={ROAD_TOP} stroke="#b08c18" strokeWidth="3" />
      <line x1={0} y1={ROAD_BOT} x2={W} y2={ROAD_BOT} stroke="#b08c18" strokeWidth="3" />
      {/* Centre divider */}
      <rect x={0} y={DIVIDER_Y - 5} width={W} height={10} fill="#0f1a0f" />
      <line x1={0} y1={DIVIDER_Y} x2={W} y2={DIVIDER_Y} stroke="#d0d0d0" strokeWidth="1.6" />
      {/* Lane dashes */}
      {Array.from({ length: 24 }, (_, i) => (
        <line key={`a${i}`} x1={i * 40} y1={LANE_A_Y} x2={i * 40 + 18} y2={LANE_A_Y}
          stroke="#fff" strokeWidth="1.3" strokeOpacity="0.09" />
      ))}
      {Array.from({ length: 24 }, (_, i) => (
        <line key={`b${i}`} x1={i * 40} y1={LANE_B_Y} x2={i * 40 + 18} y2={LANE_B_Y}
          stroke="#fff" strokeWidth="1.3" strokeOpacity="0.09" />
      ))}
      <text x={8} y={LANE_A_Y + 4} fill="#1e4a3a" fontSize="8" opacity="0.8">→ Lane A</text>
      <text x={8} y={LANE_B_Y + 4} fill="#1e3a5a" fontSize="8" opacity="0.8">← Lane B</text>

      {/* ── RSU coverage zones ── */}
      {showCov && RSUS.map(rsu => {
        const ry = (ROAD_BOT - ROAD_TOP) / 2 + 8;
        return (
          <g key={`cov-${rsu.id}`}>
            <ellipse cx={rsu.x} cy={DIVIDER_Y} rx={D_MAX} ry={ry}
              fill={rsu.color} fillOpacity="0.05"
              stroke={rsu.color} strokeOpacity="0.28"
              strokeWidth="1.2" strokeDasharray="7 4" />
            <ellipse cx={rsu.x} cy={DIVIDER_Y} rx={CANDIDATE_R} ry={ry * 0.74}
              fill="none" stroke={rsu.color}
              strokeOpacity="0.12" strokeWidth="1" strokeDasharray="3 4" />
          </g>
        );
      })}

      {/* ── V2I links ── */}
      {vehicles.filter(v => v.assignedRSU).map(v => {
        const rsu = RSUS.find(r => r.id === v.assignedRSU);
        if (!rsu) return null;
        return (
          <line key={`lk-${v.id}`}
            x1={v.x} y1={v.y} x2={rsu.x} y2={rsu.y}
            stroke={PC[v.phase]}
            strokeWidth={v.phase === PHASE.FOG ? 2 : 1}
            strokeOpacity={v.phase === PHASE.FOG ? 0.6 : 0.25}
            strokeDasharray={v.phase === PHASE.FOG ? "none" : "5 3"} />
        );
      })}

      {/* ── Vehicle trails ── */}
      {vehicles.map(v => v.trail.length > 1 && (
        <polyline key={`tr-${v.id}`}
          points={v.trail.map(p => `${p.x},${p.y}`).join(" ")}
          fill="none" stroke={PC[v.phase]}
          strokeWidth="1.1" strokeOpacity="0.13" strokeLinejoin="round" />
      ))}

      {/* ── RSUs ── */}
      {RSUS.map(rsu => {
        const fogN = vehicles.filter(v => v.phase === PHASE.FOG && v.assignedRSU === rsu.id).length;
        const candN = vehicles.filter(v => v.phase === PHASE.CANDIDATE && v.assignedRSU === rsu.id).length;
        return (
          <g key={rsu.id}>
            {fogN > 0 && (
              <circle cx={rsu.x} cy={DIVIDER_Y} r={26}
                fill="none" stroke={rsu.color} strokeWidth="1.1" strokeOpacity="0.3" />
            )}
            {/* Antenna up */}
            <line x1={rsu.x} y1={DIVIDER_Y - 5} x2={rsu.x} y2={DIVIDER_Y - 26}
              stroke={rsu.color} strokeWidth="1.8" strokeOpacity="0.6" />
            <polygon points={`${rsu.x},${DIVIDER_Y - 30} ${rsu.x - 4},${DIVIDER_Y - 22} ${rsu.x + 4},${DIVIDER_Y - 22}`}
              fill={rsu.color} opacity="0.7" />
            {/* Antenna down */}
            <line x1={rsu.x} y1={DIVIDER_Y + 5} x2={rsu.x} y2={DIVIDER_Y + 26}
              stroke={rsu.color} strokeWidth="1.8" strokeOpacity="0.6" />
            <polygon points={`${rsu.x},${DIVIDER_Y + 30} ${rsu.x - 4},${DIVIDER_Y + 22} ${rsu.x + 4},${DIVIDER_Y + 22}`}
              fill={rsu.color} opacity="0.7" />
            {/* RSU box */}
            <rect x={rsu.x - 16} y={DIVIDER_Y - 14} width={32} height={28} rx={5}
              fill="#060f1c" stroke={rsu.color} strokeWidth="2.2" />
            <line x1={rsu.x} y1={DIVIDER_Y - 10} x2={rsu.x} y2={DIVIDER_Y + 6} stroke={rsu.color} strokeWidth="2" />
            <line x1={rsu.x - 7} y1={DIVIDER_Y - 3} x2={rsu.x + 7} y2={DIVIDER_Y - 3} stroke={rsu.color} strokeWidth="1.8" />
            <circle cx={rsu.x} cy={DIVIDER_Y + 7} r="2.5" fill={rsu.color} />
            {/* Labels */}
            <text x={rsu.x} y={DIVIDER_Y - 37} textAnchor="middle" fill={rsu.color} fontSize="9" fontWeight="700">{rsu.label}</text>
            <text x={rsu.x - 20} y={DIVIDER_Y - 47} textAnchor="middle" fill="#00ff88" fontSize="7">fog:{fogN}</text>
            <text x={rsu.x + 20} y={DIVIDER_Y - 47} textAnchor="middle" fill="#00aaff" fontSize="7">cand:{candN}</text>
            <text x={rsu.x} y={DIVIDER_Y + 46} textAnchor="middle" fill="#2a4a60" fontSize="7">μᵣ={rsu.mu}</text>
          </g>
        );
      })}

      {/* ── Vehicles ── */}
      {vehicles.map(v => {
        const pc = PC[v.phase], isSel = selected === v.id;
        const rsu = v.assignedRSU ? RSUS.find(r => r.id === v.assignedRSU) : null;
        const cW = 18, cH = 10;
        return (
          <g key={v.id} onClick={e => { e.stopPropagation(); onSelect(v.id); }} style={{ cursor: "pointer" }}>
            {isSel && <circle cx={v.x} cy={v.y} r={18} fill="none" stroke="#fff" strokeWidth="1.3" strokeDasharray="4 3" />}
            {v.phase === PHASE.LEAVING && (
              <circle cx={v.x} cy={v.y} r={14} fill="none" stroke="#ff8833"
                strokeWidth="1.2" strokeOpacity="0.5" strokeDasharray="3 2" />
            )}
            {/* Car body */}
            <rect x={v.x - cW / 2} y={v.y - cH / 2} width={cW} height={cH} rx={3}
              fill={v.phase === PHASE.FOG ? (rsu?.color || "#111") : "#0a1520"}
              fillOpacity={v.phase === PHASE.FOG ? 0.4 : 0.95}
              stroke={pc} strokeWidth={isSel ? 2.5 : 1.8} />
            {/* Direction nub */}
            <polygon
              points={`${v.x + v.dir * cW / 2},${v.y} ${v.x + v.dir * (cW / 2 + 5)},${v.y - 3} ${v.x + v.dir * (cW / 2 + 5)},${v.y + 3}`}
              fill={pc} opacity="0.9" />
            {/* Wheels */}
            {[-1, 1].map(s => (
              <rect key={s} x={v.x + s * (cW / 2 - 5) - 2} y={v.y + cH / 2 - 0.5}
                width={4} height={3} rx={0.8} fill="#0a1218" stroke={pc} strokeWidth="0.6" />
            ))}
            {/* Phase badge */}
            <rect x={v.x - 22} y={v.y - cH / 2 - 16} width={44} height={13} rx={2.5}
              fill="#040a10" fillOpacity="0.92" stroke={pc} strokeWidth="0.7" />
            <text x={v.x} y={v.y - cH / 2 - 6} textAnchor="middle"
              fill={pc} fontSize="7" fontWeight="700">{PL[v.phase]}</text>
            {/* AoI */}
            <text x={v.x} y={v.y + cH / 2 + 10} textAnchor="middle"
              fill={aoiColor(v.aoi, aoiThr)} fontSize="6.5">{v.aoi.toFixed(3)}s</text>
            {/* Q-value badge for fog vehicles */}
            {v.phase === PHASE.FOG && (
              <text x={v.x} y={v.y + cH / 2 + 19} textAnchor="middle"
                fill="#00ff8877" fontSize="6">Q:{v.qValue.toFixed(2)}</text>
            )}
            <text x={v.x} y={v.y + cH / 2 + (v.phase === PHASE.FOG ? 28 : 19)}
              textAnchor="middle" fill="#2a4050" fontSize="6">{v.id}({v.lane})</text>
          </g>
        );
      })}

      {/* ── Phase legend ── */}
      <g transform="translate(10,10)">
        <rect width={150} height={100} rx={6}
          fill="#050c16" fillOpacity="0.95" stroke="#0c2030" strokeWidth="1" />
        <text x={8} y={16} fill="#1a3a55" fontSize="8" fontWeight="700" letterSpacing="1">PHASE LEGEND</text>
        {Object.entries(PL).map(([p, l], i) => (
          <g key={p} transform={`translate(8,${23 + i * 15})`}>
            <rect width={7} height={7} rx={1.5} fill={PC[p]} y={-1} />
            <text x={12} y={6.5} fill="#3a5a70" fontSize="7.5">{l}</text>
            <text x={130} y={6.5} fill={PC[p]} fontSize="8" fontWeight="700" textAnchor="end">
              {phaseCounts[p] || 0}
            </text>
          </g>
        ))}
      </g>

      {/* Coverage legend */}
      <g transform="translate(170,10)">
        <rect width={160} height={36} rx={5}
          fill="#050c16" fillOpacity="0.92" stroke="#0c2030" strokeWidth="1" />
        <ellipse cx={14} cy={13} rx={8} ry={4} fill="none" stroke="#aaa" strokeWidth="1" strokeDasharray="5 2" />
        <text x={26} y={17} fill="#3a5a70" fontSize="7.5">Outer = d_max (enter)</text>
        <ellipse cx={14} cy={27} rx={6} ry={3} fill="none" stroke="#aaa" strokeWidth="1" strokeDasharray="2 3" />
        <text x={26} y={31} fill="#3a5a70" fontSize="7.5">Inner = candidate zone</text>
      </g>
    </svg>
  );
}
