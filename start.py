"""
VFC Dueling DDQN — One-Click Launcher
Starts the FastAPI backend + Vite frontend and opens the browser.

Usage:  python start.py
"""

import subprocess
import sys
import os
import time
import webbrowser
import signal
import urllib.request

# ── Paths ──────────────────────────────────────────────────────────
ROOT_DIR    = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(ROOT_DIR, "VFC_Backend")
FRONTEND_DIR = os.path.join(ROOT_DIR, "VFC_Vite")
NODE_NPX    = os.path.join("C:\\Program Files", "nodejs", "npx.cmd")

BACKEND_URL  = "http://localhost:8000"
FRONTEND_URL = "http://localhost:5173"

processes = []


def log(msg):
    print(f"  [LAUNCHER] {msg}")


def check_url(url, timeout=2):
    """Return True if the URL responds with HTTP 200."""
    try:
        r = urllib.request.urlopen(url, timeout=timeout)
        return r.status == 200
    except Exception:
        return False


def wait_for(url, name, max_wait=30):
    """Poll a URL until it responds or timeout."""
    log(f"Waiting for {name} at {url} ...")
    for i in range(max_wait):
        if check_url(url):
            log(f"✅ {name} is ready!")
            return True
        time.sleep(1)
    log(f"⚠  {name} did not respond within {max_wait}s — check the terminal output above.")
    return False


def cleanup(*_):
    """Kill all child processes on exit."""
    log("Shutting down...")
    for p in processes:
        try:
            p.terminate()
        except Exception:
            pass
    sys.exit(0)


signal.signal(signal.SIGINT,  cleanup)
signal.signal(signal.SIGTERM, cleanup)


def main():
    print()
    print("  ╔══════════════════════════════════════════════════════╗")
    print("  ║  VFC Dueling DDQN — AoI Minimization Simulator     ║")
    print("  ║  Backend : FastAPI + PyTorch  (port 8000)           ║")
    print("  ║  Frontend: React + Vite       (port 5173)           ║")
    print("  ╚══════════════════════════════════════════════════════╝")
    print()

    # ── 1. Check node_modules ──────────────────────────────────────
    node_modules = os.path.join(FRONTEND_DIR, "node_modules")
    if not os.path.isdir(node_modules):
        log("Installing frontend dependencies (npm install)...")
        subprocess.run([NODE_NPX.replace("npx", "npm"), "install"],
                       cwd=FRONTEND_DIR, shell=True)

    # ── 2. Start Backend ───────────────────────────────────────────
    log("Starting FastAPI backend...")
    backend = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "main:app",
         "--host", "0.0.0.0", "--port", "8000"],
        cwd=BACKEND_DIR,
    )
    processes.append(backend)

    # ── 3. Start Frontend ──────────────────────────────────────────
    log("Starting Vite frontend...")
    frontend = subprocess.Popen(
        [NODE_NPX, "vite", "--host"],
        cwd=FRONTEND_DIR,
        shell=True,
    )
    processes.append(frontend)

    # ── 4. Wait for both to be ready ──────────────────────────────
    wait_for(BACKEND_URL, "Backend")
    wait_for(FRONTEND_URL, "Frontend")

    # ── 5. Open browser ───────────────────────────────────────────
    log(f"Opening browser → {FRONTEND_URL}")
    webbrowser.open(FRONTEND_URL)

    print()
    print("  ┌──────────────────────────────────────────────────────┐")
    print(f"  │  🌐 Dashboard:  {FRONTEND_URL:<37s}│")
    print(f"  │  ⚙  API:        {BACKEND_URL:<37s}│")
    print("  │  Press Ctrl+C to stop both servers.                 │")
    print("  └──────────────────────────────────────────────────────┘")
    print()

    # ── 6. Keep alive until Ctrl+C ────────────────────────────────
    try:
        while True:
            # If either process dies, report it
            if backend.poll() is not None:
                log("⚠  Backend process exited unexpectedly!")
                break
            if frontend.poll() is not None:
                log("⚠  Frontend process exited unexpectedly!")
                break
            time.sleep(2)
    except KeyboardInterrupt:
        pass
    finally:
        cleanup()


if __name__ == "__main__":
    main()

