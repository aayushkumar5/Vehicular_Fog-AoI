import { useState, useEffect, useRef, useCallback } from "react";
import RSUPanel, { StatsPanel } from "./components/RSUPanel";
import VehicleInspector from "./components/VehicleInspector";
import SimCanvas from "./components/SimCanvas";
import ConfigBar from "./components/ConfigBar";
import { WSManager } from "./lib/websocket";
import { initVehicles, dist, rand } from "./lib/sim";
import { RSUS, PHASE, D_MAX, CANDIDATE_R, AOI_THRESHOLD } from "./lib/constants";
import "./index.css";

export default function App() {
  const [vehicles, setVehicles] = useState(() => initVehicles(10));
  const [numVeh, setNumVeh] = useState(10);
  const [aoiThr, setAoiThr] = useState(AOI_THRESHOLD);
  const [running, setRunning] = useState(false);
  const [selected, setSelected] = useState(null);
  const [showCov, setShowCov] = useState(true);
  const [wsStatus, setWsStatus] = useState("disconnected");

  // Backend result state
  const [episode, setEpisode] = useState(1);
  const [step, setStep] = useState(0);
  const [epsilon, setEpsilon] = useState(1.0);
  const [bufSize, setBufSize] = useState(0);
  const [avgAoI, setAvgAoI] = useState(0);
  const [avgRew, setAvgRew] = useState(0);
  const [avgLoss, setAvgLoss] = useState(0);
  const [rewardH, setRewardH] = useState([]);
  const [aoiH, setAoiH] = useState([]);
  const [lossH, setLossH] = useState([]);
  const [rsuLogs, setRsuLogs] = useState(Object.fromEntries(RSUS.map(r => [r.id, []])));

  const rafRef = useRef();
  const lastRef = useRef(0);
  const stepRef = useRef(0);
  const episodeRef = useRef(1);
  const wsRef = useRef(null);
  const logRef = useRef(Object.fromEntries(RSUS.map(r => [r.id, []])));
  const aoiThrRef = useRef(aoiThr);
  useEffect(() => { aoiThrRef.current = aoiThr; }, [aoiThr]);

  // Handle results from backend
  const handleBackendMessage = useCallback((data) => {
    if (data.error) { console.error("[Backend]", data.error); return; }

    setEpisode(data.episode ?? 1);
    setStep(data.step ?? 0);
    setEpsilon(data.epsilon ?? 1);
    setBufSize(data.buffer_size ?? 0);
    setAvgAoI(data.avg_aoi ?? 0);
    setAvgRew(data.avg_reward ?? 0);
    if (data.loss > 0) setAvgLoss(data.loss);
    setRewardH(h => [...h.slice(-90), data.avg_reward ?? 0]);
    setAoiH(h => [...h.slice(-90), data.avg_aoi ?? 0]);
    if (data.loss > 0) setLossH(h => [...h.slice(-90), data.loss]);

    const resultMap = {};
    (data.vehicles ?? []).forEach(r => { resultMap[r.id] = r; });

    setVehicles(prev => prev.map(v => {
      const r = resultMap[v.id];
      if (!r) return v;

      // Log RSU events
      if (r.phase === "FOG" && v.phase !== PHASE.FOG && r.assigned_rsu) {
        logRef.current = {
          ...logRef.current,
          [r.assigned_rsu]: [
            { msg: `${v.id}(${v.lane}) → FOG ✓ Q=${r.q_value}`, color: "#00ff88" },
            ...(logRef.current[r.assigned_rsu] || [])
          ].slice(0, 5),
        };
      }
      if (r.status === "REJECTED" && r.assigned_rsu) {
        logRef.current = {
          ...logRef.current,
          [r.assigned_rsu]: [
            { msg: `${v.id} ✗ ${r.reason.slice(0, 30)}`, color: "#ff4466" },
            ...(logRef.current[r.assigned_rsu] || [])
          ].slice(0, 5),
        };
      }

      return {
        ...v,
        aoi: r.aoi,
        beta: r.beta,
        assignedRSU: r.assigned_rsu,
        phase: r.phase === "OUT" ? PHASE.OUT
          : r.phase === "FOG" ? PHASE.FOG
            : r.phase === "CANDIDATE" ? PHASE.CANDIDATE
              : v.phase,
        qValue: r.q_value,
        vValue: r.v_value,
        action: r.action,
        status: r.status,
        reason: r.reason,
      };
    }));

    setRsuLogs({ ...logRef.current });
  }, []);

  useEffect(() => {
    wsRef.current = new WSManager(handleBackendMessage, setWsStatus);
    wsRef.current.connect();
    return () => wsRef.current?.disconnect();
  }, [handleBackendMessage]);

  // Physics tick — movement only, NO ML
  const tick = useCallback((ts) => {
    if (!lastRef.current) lastRef.current = ts;
    const dt = Math.min((ts - lastRef.current) / 16.67, 3);
    lastRef.current = ts;

    setVehicles(prev => {
      const next = prev.map(v => {
        let nx = v.x + v.dir * v.speed * dt;
        if (nx > 900) nx = -20;
        if (nx < -20) nx = 900;

        let best = null, minD = Infinity;
        for (const rsu of RSUS) {
          const d = dist(nx, v.y, rsu.x, rsu.y);
          if (d <= D_MAX && d < minD) { minD = d; best = rsu; }
        }

        const wasIn = !!v.assignedRSU, nowIn = !!best;
        let phase = v.phase, leavingTimer = v.leavingTimer ?? 0;

        if (nowIn) {
          if (!wasIn) {
            phase = PHASE.ENTERING;
            logRef.current = {
              ...logRef.current,
              [best.id]: [
                { msg: `${v.id}(${v.lane}) V2I link up`, color: "#ffe066" },
                ...(logRef.current[best.id] || [])
              ].slice(0, 5),
            };
          }
          if (minD <= CANDIDATE_R && phase === PHASE.ENTERING) phase = PHASE.CANDIDATE;
        } else {
          if (wasIn) {
            phase = PHASE.LEAVING; leavingTimer = 28;
            logRef.current = {
              ...logRef.current,
              [v.assignedRSU]: [
                { msg: `${v.id}(${v.lane}) left — β→0`, color: "#ff8833" },
                ...(logRef.current[v.assignedRSU] || [])
              ].slice(0, 5),
            };
          } else if (phase === PHASE.LEAVING) {
            leavingTimer--;
            if (leavingTimer <= 0) phase = PHASE.OUT;
          } else phase = PHASE.OUT;
        }

        const trail = [...(v.trail || []), { x: nx, y: v.y }].slice(-22);
        return { ...v, x: nx, assignedRSU: nowIn ? best.id : null, phase, leavingTimer, trail };
      });

      // Send to backend
      if (wsRef.current?.isConnected) {
        stepRef.current += 1;
        if (stepRef.current % 200 === 0) episodeRef.current += 1;
        wsRef.current.send({
          vehicles: next.map(v => ({
            id: v.id, x: v.x, y: v.y,
            speed: v.speed, direction: v.dir, lane: v.lane,
            lambda: v.lambda, mu_v: v.mu_v ?? 6.0,
          })),
          rsu_positions: RSUS.map(r => ({ id: r.id, x: r.x, y: r.y, mu_r: r.mu })),
          aoi_threshold: aoiThrRef.current,
          episode: episodeRef.current,
          step: stepRef.current,
        });
      }
      return next;
    });

    rafRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    if (running) { lastRef.current = 0; rafRef.current = requestAnimationFrame(tick); }
    else cancelAnimationFrame(rafRef.current);
    return () => cancelAnimationFrame(rafRef.current);
  }, [running, tick]);

  const reset = () => {
    cancelAnimationFrame(rafRef.current);
    setVehicles(initVehicles(numVeh)); setRunning(false);
    stepRef.current = 0; episodeRef.current = 1;
    setEpisode(1); setStep(0); setEpsilon(1);
    setRewardH([]); setAoiH([]); setLossH([]);
    logRef.current = Object.fromEntries(RSUS.map(r => [r.id, []]));
    setRsuLogs(Object.fromEntries(RSUS.map(r => [r.id, []])));
    setSelected(null);
    fetch("http://localhost:8000/reset", { method: "POST" }).catch(() => { });
  };

  const applyVehicleCount = (n) => {
    setNumVeh(n); setVehicles(initVehicles(n));
    setRunning(false); stepRef.current = 0;
  };

  const selV = selected ? vehicles.find(v => v.id === selected) : null;
  const selRSU = selV?.assignedRSU ? RSUS.find(r => r.id === selV.assignedRSU) : null;
  const phaseCounts = Object.fromEntries(
    Object.values(PHASE).map(p => [p, vehicles.filter(v => v.phase === p).length])
  );
  const fogTotal = vehicles.filter(v => v.phase === PHASE.FOG).length;
  const statusColor = { connected: "#00ff88", connecting: "#ffe066", disconnected: "#ff4466", error: "#ff4466" };

  return (
    <div className="app">
      <div className="header">
        <div>
          <div className="header-sub">Vehicular Fog Computing · IEEE ICC 2025 · Dueling DDQN</div>
          <div className="header-title">AoI Minimization — Real-Time V2I Fog Formation</div>
          <div className="header-eq">
            Q(s,a;θ)=V(s;θ)+[A(s,a;θ)−mean(A)] · rₜ=1/Δₜ · 3 RSUs · {vehicles.length} Vehicles
          </div>
        </div>
        <div className="header-btns">
          <div style={{
            padding: "4px 9px", borderRadius: 5, fontSize: 8.5, fontFamily: "monospace",
            border: `1px solid ${statusColor[wsStatus]}`, color: statusColor[wsStatus]
          }}>
            ⬤ Backend {wsStatus}
          </div>
          <button className="btn" style={{ borderColor: "#3a7a9a", color: "#3a7a9a" }}
            onClick={() => setShowCov(s => !s)}>{showCov ? "Hide" : "Show"} Cov.</button>
          <button className="btn" style={{ borderColor: "#ff4466", color: "#ff4466" }} onClick={reset}>↺ Reset</button>
          <button className="btn run-btn"
            style={{ borderColor: running ? "#00ff88" : "#00f5ff", color: running ? "#00ff88" : "#00f5ff" }}
            onClick={() => setRunning(r => !r)}>{running ? "⏸ Pause" : "▶ Run"}</button>
        </div>
      </div>

      <ConfigBar numVeh={numVeh} aoiThr={aoiThr} onVehicles={applyVehicleCount} onThr={setAoiThr} />

      <div className="main-layout">
        <div className="canvas-col">
          <SimCanvas vehicles={vehicles} showCov={showCov} selected={selected}
            phaseCounts={phaseCounts} aoiThr={aoiThr}
            onSelect={id => setSelected(id)} onDeselect={() => setSelected(null)} />
          <RSUPanel rsuLogs={rsuLogs} vehicles={vehicles} />
        </div>
        <div className="right-panel">
          <StatsPanel episode={episode} step={step} epsilon={epsilon}
            bufSize={bufSize} avgRew={avgRew} avgAoI={avgAoI} avgLoss={avgLoss}
            aoiThr={aoiThr} fogTotal={fogTotal} vehicles={vehicles}
            rewardH={rewardH} aoiH={aoiH} lossH={lossH} />
          <VehicleInspector selV={selV} selRSU={selRSU} />
        </div>
      </div>

      <div className="steps-grid">
        {[
          { n: "①", t: "Send Params", c: "#ffe066", b: "Frontend → Backend via WebSocket: pos/speed/λ/μᵥ per vehicle" },
          { n: "②", t: "AoI Eval Δᵢ", c: "#00aaff", b: "Backend: Δ=1/(1-ε)λ + 1/(1-ε)μᵣ + λμᵣε/(λ+μᵣ) · Eq.(14)" },
          { n: "③", t: "Accept / Reject", c: "#ff4466", b: "AoI ≤ threshold → ACCEPT · AoI > threshold → REJECT · Eq.(19a)" },
          { n: "④", t: "Dueling DDQN", c: "#a78bfa", b: "PyTorch: Q=V+[A−mean(A)] · Double Q target · Eq.(21,22,23)" },
          { n: "⑤", t: "Results → Display", c: "#00ff88", b: "Backend → Frontend: status/AoI/Q/phase per vehicle via WebSocket" },
        ].map(c => (
          <div key={c.t} className="step-card" style={{ borderColor: c.c + "30" }}>
            <div className="step-header">
              <span style={{ fontSize: 14, color: c.c }}>{c.n}</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: c.c }}>{c.t}</span>
            </div>
            <div className="step-body">{c.b}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
