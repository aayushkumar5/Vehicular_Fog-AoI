/**
 * WebSocket manager
 * Handles connection, reconnection, send/receive to FastAPI backend.
 */

const WS_URL = "ws://localhost:8000/ws";

export class WSManager {
  constructor(onMessage, onStatusChange) {
    this.onMessage      = onMessage;
    this.onStatusChange = onStatusChange;
    this.ws             = null;
    this.reconnectTimer = null;
  }

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    this.ws = new WebSocket(WS_URL);
    this.onStatusChange("connecting");

    this.ws.onopen = () => {
      console.log("[WS] Connected to backend");
      this.onStatusChange("connected");
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.onMessage(data);
      } catch (e) {
        console.error("[WS] Parse error:", e);
      }
    };

    this.ws.onclose = () => {
      console.log("[WS] Disconnected — retrying in 2s");
      this.onStatusChange("disconnected");
      this.reconnectTimer = setTimeout(() => this.connect(), 2000);
    };

    this.ws.onerror = (e) => {
      console.error("[WS] Error:", e);
      this.onStatusChange("error");
    };
  }

  send(payload) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }

  get isConnected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
