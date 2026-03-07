"""
Dueling Double Deep Q-Network — PyTorch implementation
Implements Equation (21) from the paper:
Q(s,a;θ) = V(s;θ) + [A(s,a;θ) − (1/|A|)·Σ A(s,a';θ)]
"""

import torch
import torch.nn as nn
import torch.optim as optim
import numpy as np
import os
from typing import Tuple, List

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")


class DuelingNetwork(nn.Module):
    """
    Dueling architecture:
      Input → Shared backbone → splits into:
        • Value stream    V(s)    → scalar
        • Advantage stream A(s,a) → action_dim values
      Combined via Eq.(21): Q = V + (A - mean(A))
    """
    def __init__(self, state_dim: int, action_dim: int, hidden: int = 128):
        super().__init__()
        self.action_dim = action_dim

        # Shared backbone — two ReLU layers
        self.shared = nn.Sequential(
            nn.Linear(state_dim, hidden),
            nn.ReLU(),
            nn.Linear(hidden, hidden),
            nn.ReLU(),
        )

        # Value stream V(s) → scalar
        self.value_stream = nn.Sequential(
            nn.Linear(hidden, 64),
            nn.ReLU(),
            nn.Linear(64, 1),
        )

        # Advantage stream A(s,a) → action_dim
        self.advantage_stream = nn.Sequential(
            nn.Linear(hidden, 64),
            nn.ReLU(),
            nn.Linear(64, action_dim),
        )

        # He initialisation — matches paper's training setup
        self._init_weights()

    def _init_weights(self):
        for m in self.modules():
            if isinstance(m, nn.Linear):
                nn.init.kaiming_uniform_(m.weight, nonlinearity="relu")
                nn.init.zeros_(m.bias)

    def forward(self, x: torch.Tensor):
        h = self.shared(x)
        V = self.value_stream(h)            # (batch, 1)
        A = self.advantage_stream(h)        # (batch, action_dim)
        # Equation (21)
        Q = V + (A - A.mean(dim=-1, keepdim=True))
        return Q, V.squeeze(-1), A


class DuelingDDQN:
    """
    Full Dueling DDQN agent with:
    • Online network  (θ)   — trained every step
    • Target network  (θ')  — synced every TARGET_SYNC steps
    • Experience replay buffer
    • ε-greedy exploration
    • Double Q-Learning target — Equation (22)
    • MSE loss               — Equation (23)
    """

    def __init__(
        self,
        state_dim:   int,
        action_dim:  int,
        hidden:      int   = 128,
        lr:          float = 3e-3,
        gamma:       float = 0.99,
        eps_start:   float = 1.0,
        eps_min:     float = 0.05,
        eps_decay:   float = 0.9965,
        target_sync: int   = 60,
        batch_size:  int   = 32,
        buffer_size: int   = 512,
    ):
        self.state_dim   = state_dim
        self.action_dim  = action_dim
        self.gamma       = gamma
        self.eps         = eps_start
        self.eps_min     = eps_min
        self.eps_decay   = eps_decay
        self.target_sync = target_sync
        self.batch_size  = batch_size
        self.step_count  = 0

        # Online & target networks
        self.online = DuelingNetwork(state_dim, action_dim, hidden).to(DEVICE)
        self.target = DuelingNetwork(state_dim, action_dim, hidden).to(DEVICE)
        self.target.load_state_dict(self.online.state_dict())
        self.target.eval()

        # Adam optimizer
        self.optimizer = optim.Adam(self.online.parameters(), lr=lr)
        self.loss_fn   = nn.MSELoss()

        # Replay buffer
        self.buffer: list = []
        self.buffer_ptr   = 0
        self.buffer_size  = buffer_size

    # ── Replay buffer ──────────────────────────────────────────────
    def push(self, s, a, r, s_next, done):
        exp = (s, a, r, s_next, done)
        if len(self.buffer) < self.buffer_size:
            self.buffer.append(exp)
        else:
            self.buffer[self.buffer_ptr] = exp
            self.buffer_ptr = (self.buffer_ptr + 1) % self.buffer_size

    # ── ε-greedy action selection ──────────────────────────────────
    def select_actions(self, state: np.ndarray) -> Tuple[List[int], List[float], float]:
        """
        Returns actions, Q-values, V-value for all action slots.
        Uses online network for inference.
        """
        s_tensor = torch.FloatTensor(state).unsqueeze(0).to(DEVICE)
        with torch.no_grad():
            Q, V, A = self.online(s_tensor)
        q_vals = Q.squeeze(0).cpu().numpy().tolist()
        v_val  = float(V.squeeze(0).cpu().numpy())

        actions = []
        for q in q_vals:
            if np.random.random() < self.eps:
                actions.append(np.random.randint(0, 2))   # explore
            else:
                actions.append(1 if q > 0 else 0)         # exploit
        return actions, q_vals, v_val

    # ── Training step ───────────────────────────────────────────────
    def train_step(self) -> float:
        """
        One gradient update using a random mini-batch.
        Implements Double Q-Learning — Equation (22):
          y = r + γ · Qtarget(s', argmax_a' Qonline(s', a'))
        Loss — Equation (23):
          L(θ) = (y - Q(s,a;θ))²
        """
        if len(self.buffer) < self.batch_size:
            return 0.0

        # Sample mini-batch
        indices = np.random.choice(len(self.buffer), self.batch_size, replace=False)
        batch   = [self.buffer[i] for i in indices]
        S, A, R, S_next, D = zip(*batch)

        S      = torch.FloatTensor(np.array(S)).to(DEVICE)
        A      = torch.LongTensor(A).to(DEVICE)
        R      = torch.FloatTensor(R).to(DEVICE)
        S_next = torch.FloatTensor(np.array(S_next)).to(DEVICE)
        D      = torch.FloatTensor(D).to(DEVICE)

        # Current Q values
        Q_curr, _, _ = self.online(S)
        q_curr = Q_curr.gather(1, A.unsqueeze(1)).squeeze(1)

        # Double Q — Eq.(22): online selects action, target evaluates
        with torch.no_grad():
            Q_next_online, _, _ = self.online(S_next)
            best_actions        = Q_next_online.argmax(dim=1)
            Q_next_target, _, _ = self.target(S_next)
            q_next = Q_next_target.gather(1, best_actions.unsqueeze(1)).squeeze(1)

        y = R + self.gamma * q_next * (1 - D)   # Eq.(22)

        # Loss — Eq.(23)
        loss = self.loss_fn(q_curr, y)

        self.optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(self.online.parameters(), max_norm=10.0)
        self.optimizer.step()

        self.step_count += 1

        # Sync target network θ' ← θ
        if self.step_count % self.target_sync == 0:
            self.target.load_state_dict(self.online.state_dict())

        # Decay epsilon
        self.eps = max(self.eps_min, self.eps * self.eps_decay)

        return float(loss.item())

    # ── Checkpoint save/load ───────────────────────────────────────
    def save(self, path: str = "checkpoint.pth"):
        torch.save({
            "online":     self.online.state_dict(),
            "target":     self.target.state_dict(),
            "optimizer":  self.optimizer.state_dict(),
            "eps":        self.eps,
            "step_count": self.step_count,
        }, path)
        print(f"[DDQN] Saved checkpoint → {path}")

    def load(self, path: str = "checkpoint.pth"):
        if not os.path.exists(path):
            print(f"[DDQN] No checkpoint found at {path}, starting fresh.")
            return
        try:
            ckpt = torch.load(path, map_location=DEVICE)
            self.online.load_state_dict(ckpt["online"])
            self.target.load_state_dict(ckpt["target"])
            self.optimizer.load_state_dict(ckpt["optimizer"])
            self.eps        = ckpt.get("eps",        self.eps)
            self.step_count = ckpt.get("step_count", 0)
            print(f"[DDQN] Loaded checkpoint from {path} (step={self.step_count}, ε={self.eps:.3f})")
        except (RuntimeError, KeyError) as e:
            print(f"[DDQN] Checkpoint at {path} is incompatible with current network architecture.")
            print(f"[DDQN] Reason: {e}")
            print(f"[DDQN] Starting fresh with random weights.")
