from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from threading import RLock
import time

from .settings import settings


@dataclass
class SubjectState:
    violation_count: int = 0
    last_risk_score: int = 0


@dataclass
class RateBucket:
    count: int = 0
    window_start: float = 0.0


class ModerationStore:
    def __init__(self) -> None:
        self._lock = RLock()
        self._user_states: dict[str, SubjectState] = defaultdict(SubjectState)
        self._session_states: dict[str, SubjectState] = defaultdict(SubjectState)
        self._ip_buckets: dict[str, RateBucket] = defaultdict(RateBucket)

    def increment_violation(self, user_hash: str, session_hash: str, risk_score: int) -> tuple[int, int]:
        with self._lock:
            user_state = self._user_states[user_hash]
            session_state = self._session_states[session_hash]
            user_state.violation_count += 1
            session_state.violation_count += 1
            user_state.last_risk_score = risk_score
            session_state.last_risk_score = risk_score
            return user_state.violation_count, session_state.violation_count

    def read_counts(self, user_hash: str, session_hash: str) -> tuple[int, int]:
        with self._lock:
            user_state = self._user_states[user_hash]
            session_state = self._session_states[session_hash]
            return user_state.violation_count, session_state.violation_count

    def is_rate_limited(self, ip_hash: str) -> bool:
        now = time.time()
        with self._lock:
            bucket = self._ip_buckets[ip_hash]
            if now - bucket.window_start >= settings.rate_limit_window_seconds:
                bucket.window_start = now
                bucket.count = 0
            bucket.count += 1
            return bucket.count > settings.rate_limit_requests


store = ModerationStore()
