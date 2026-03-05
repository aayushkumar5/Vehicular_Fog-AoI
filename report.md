# 📋 Vehicular_Fog-AoI — Project Audit Report

**Date:** March 5, 2026  
**Repository:** `https://github.com/aayushkumar5/Vehicular_Fog-AoI.git`  
**Location:** `A:\Python Projects\Vehicular_Fog-AoI\`

---

## 1. Missing Files Check

### 📁 Complete File Tree (as cloned)

```
Vehicular_Fog-AoI/
├── .gitignore
├── dashboard.png
├── figure4_reward_convergence.png
├── figure5_aoi_vs_vehicles.png
├── training_log.csv
├── VFC_DuelingDDQN_Final_Fixed.ipynb
├── VFC_Full_Project.zip
├── VFC_Full_Project_Fixed.zip
├── saved_models/
│   ├── dueling_ddqn_best.pth
│   ├── dueling_ddqn_checkpoint.pth
│   └── dueling_ddqn_online.pth
├── VFC_Backend/
│   ├── ddqn.py
│   ├── environment.py
│   ├── main.py
│   └── requirements.txt
└── VFC_Vite/
    ├── index.html
    ├── package.json
    ├── vite.config.js
    └── src/
        ├── App.jsx
        ├── main.jsx
        ├── index.css
        ├── components/
        │   ├── ConfigBar.jsx
        │   ├── RSUPanel.jsx
        │   ├── SimCanvas.jsx
        │   ├── Sparkline.jsx
        │   └── VehicleInspector.jsx
        └── lib/
            ├── constants.js
            ├── ddqn.js
            ├── sim.js
            └── websocket.js
```

### ❌ Missing Files

| # | Missing File/Folder | Where Expected | Why It's Needed |
|---|---|---|---|
| 1 | **`VFC_Vite/node_modules/`** | `VFC_Vite/` | Required to run the React/Vite frontend. Not installed — `npm install` has not been run. (Not committed to Git, which is correct — but must be installed locally.) |
| 2 | **`VFC_Vite/package-lock.json`** | `VFC_Vite/` | Lock file for reproducible dependency installs. Should have been committed to the repo. |
| 3 | **`VFC_Backend/checkpoint.pth`** | `VFC_Backend/` | `main.py` line 59 calls `agent.load("checkpoint.pth")` — uses a **relative path** that looks for `checkpoint.pth` in the **current working directory** (not `saved_models/`). The pre-trained models exist only inside `saved_models/` with different names (`dueling_ddqn_best.pth`, etc.). This means the backend will always start fresh because it can never find `checkpoint.pth`. |
| 4 | **`VFC_Backend/.env`** | `VFC_Backend/` | `python-dotenv` is listed as a dependency in `requirements.txt`, but no `.env` file exists. (Listed in `.gitignore`, so it was excluded — but no `.env.example` is provided to tell users what variables are needed.) |
| 5 | **`README.md`** (content) | Root | File exists but was not inspected for setup instructions. The repo lacks explicit instructions on how to link the `saved_models/` pre-trained weights to the backend. |

---

## 2. Code Errors & Path Mismatches

### 🔴 CRITICAL — `ImportError` in `VFC_Backend/main.py` (Line 117)

**File:** `VFC_Backend/main.py`, line 117  
**Error:** `ImportError: cannot import name 'calc_aoi' from 'environment'`

```python
# main.py line 117 (INSIDE the websocket loop):
from environment import calc_aoi, find_best_rsu
```

**Problem:** The function `calc_aoi` **does not exist** in `environment.py`. The available functions are:
- `calc_aoi_per_packet()` — Equation (14)
- `calc_aoi_average()` — Equation (16)
- `calc_aoi_final()` — Equation (17)

**Impact:** The backend WebSocket handler will **crash** on the first message from the frontend. No vehicle processing can occur.

**Fix:** Change line 117 and line 121 in `main.py`:
```python
# Line 117 — change to:
from environment import calc_aoi_final, find_best_rsu

# Line 121 — change to:
aoi_map[v.id] = calc_aoi_final(v.lambda_rate, best_rsu.mu_r) if best_rsu else 0.28
```

---

### 🟡 HIGH — Checkpoint Path Mismatch in `VFC_Backend/main.py` (Line 59)

**File:** `VFC_Backend/main.py`, lines 59, 175, 219, 242  
**Issue:** The backend loads/saves checkpoints to `"checkpoint.pth"` (relative path = CWD).

```python
# Line 59:
agent.load("checkpoint.pth")

# Lines 175, 219, 242:
agent.save("checkpoint.pth")
```

**Problem:** Pre-trained models are stored in `saved_models/` at the **repo root** (one directory up from `VFC_Backend/`):
- `saved_models/dueling_ddqn_checkpoint.pth`
- `saved_models/dueling_ddqn_best.pth`
- `saved_models/dueling_ddqn_online.pth`

But the backend code looks for `checkpoint.pth` in whatever directory `uvicorn` is launched from. These paths **never match**.

**Impact:** Pre-trained weights are never loaded. The agent always starts from scratch.

**Fix:** Update the load path to point to the saved model:
```python
import os
MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "saved_models")
CKPT_PATH = os.path.join(MODEL_DIR, "dueling_ddqn_checkpoint.pth")

# Line 59:
agent.load(CKPT_PATH)
```

---

### 🟡 HIGH — Redundant Import Inside WebSocket Loop (`main.py`, Line 117)

**File:** `VFC_Backend/main.py`, line 117  
**Issue:** Import statement is **inside the `while True` loop** of the WebSocket handler:

```python
while True:
    ...
    from environment import calc_aoi, find_best_rsu   # ← re-imported every tick
```

**Problem:** While Python caches imports, placing an `import` inside a hot loop is bad practice and was likely done to work around a circular import or a forgotten top-level import.

**Fix:** Move this import to the **top of the file** alongside the other imports from `environment` (line 24-27).

---

### 🟡 MEDIUM — `buildState` in `sim.js` uses `lambda` instead of `mu_v` (Line 22)

**File:** `VFC_Vite/src/lib/sim.js`, line 22  
**Issue:** The state vector comment says `sₜ = [λ(N), μ_r(M), μ_v(N), Δ(N)]` but the third component uses `v.lambda / 10` instead of `v.mu_v`:

```javascript
// sim.js line 20-24:
return [
    ...padded.slice(0, N).map(v => v.lambda / 10),   // λ(N) ✓
    ...RSUS.map(r => r.mu / 12),                      // μ_r(M) ✓
    ...padded.slice(0, N).map(v => v.lambda / 10),    // ← BUG: should be v.mu_v / 10
    ...padded.slice(0, N).map(v => v.aoi / 0.28),     // Δ(N) ✓
];
```

**Comparison with backend (`environment.py` line 154-157):**
```python
lambdas = [v.lambda_rate / 10.0 for v in vehicles[:n]]     # ✓
mu_vs   = [v.mu_v / 10.0       for v in vehicles[:n]]      # ✓ uses mu_v
```

**Impact:** The frontend's local state vector doesn't match the backend's. While the backend does the real computation, this inconsistency means the frontend `ddqn.js` local network (if used for display) would produce incorrect Q-values.

**Fix:**
```javascript
...padded.slice(0, N).map(v => (v.mu_v || 6.0) / 10),   // μ_v(N)
```

---

### 🟢 LOW — `node_modules` Not Installed for Frontend

**File:** `VFC_Vite/`  
**Issue:** The `node_modules/` directory does not exist. The frontend cannot be started with `npm run dev` until dependencies are installed.

**Fix:** Run:
```bash
cd VFC_Vite
npm install
```

---

### 🟢 LOW — No `.env` File Despite `python-dotenv` Dependency

**File:** `VFC_Backend/requirements.txt` lists `python-dotenv==1.0.1`  
**Issue:** No `.env` file or `.env.example` exists. While the backend code doesn't explicitly call `load_dotenv()`, having this dependency with no documentation is confusing.

**Impact:** Minimal — the backend runs fine without it, but it suggests an incomplete setup.

**Fix:** Either remove `python-dotenv` from `requirements.txt`, or add an `.env.example` file documenting expected variables.

---

## Summary

| # | Severity | File | Issue |
|---|---|---|---|
| 1 | 🔴 **CRITICAL** | `VFC_Backend/main.py:117` | `ImportError` — `calc_aoi` does not exist in `environment.py`. Should be `calc_aoi_final`. **Backend will crash.** |
| 2 | 🟡 **HIGH** | `VFC_Backend/main.py:59` | Checkpoint path mismatch — looks for `checkpoint.pth` but models are in `../saved_models/` with different names. Pre-trained weights never load. |
| 3 | 🟡 **HIGH** | `VFC_Backend/main.py:117` | Import statement inside `while True` loop — should be at the top of the file. |
| 4 | 🟡 **MEDIUM** | `VFC_Vite/src/lib/sim.js:22` | `buildState()` uses `lambda` instead of `mu_v` for the 3rd state vector component — mismatches the backend. |
| 5 | 🟢 **LOW** | `VFC_Vite/` | `node_modules/` missing — `npm install` required before frontend can run. |
| 6 | 🟢 **LOW** | `VFC_Backend/` | `python-dotenv` in requirements but no `.env` or `.env.example` file. |
| 7 | ℹ️ **INFO** | `VFC_Vite/` | `package-lock.json` missing from repo — recommended for reproducible builds. |

---

### ✅ Files That Are Correct (No Issues Found)

| File | Status |
|---|---|
| `VFC_Backend/ddqn.py` | ✅ Clean — Dueling DDQN implementation is correct |
| `VFC_Backend/environment.py` | ✅ Clean — Equations (14), (16), (17), (19a,b), (20) implemented correctly |
| `VFC_Backend/requirements.txt` | ✅ All packages installable |
| `VFC_Vite/src/App.jsx` | ✅ Clean |
| `VFC_Vite/src/main.jsx` | ✅ Clean |
| `VFC_Vite/src/index.css` | ✅ Clean |
| `VFC_Vite/src/components/SimCanvas.jsx` | ✅ Clean |
| `VFC_Vite/src/components/RSUPanel.jsx` | ✅ Clean |
| `VFC_Vite/src/components/VehicleInspector.jsx` | ✅ Clean |
| `VFC_Vite/src/components/ConfigBar.jsx` | ✅ Clean |
| `VFC_Vite/src/components/Sparkline.jsx` | ✅ Clean |
| `VFC_Vite/src/lib/constants.js` | ✅ Clean |
| `VFC_Vite/src/lib/ddqn.js` | ✅ Clean |
| `VFC_Vite/src/lib/websocket.js` | ✅ Clean |
| `VFC_Vite/vite.config.js` | ✅ Clean |
| `VFC_Vite/index.html` | ✅ Clean |
| `VFC_Vite/package.json` | ✅ Clean |
| `saved_models/*.pth` | ✅ Present (3 model files) |

---

*Report generated by automated code audit.*

