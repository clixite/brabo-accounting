"""Tiny Prometheus text-format metrics, dependency-free.

Exposes request counters/histograms and engine state at `/metrics`
(hand-rolled so the OCR image stays lean).
"""

from __future__ import annotations

import threading
import time

_BUCKETS = (0.1, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0, 60.0, 120.0, 240.0, float("inf"))


class Metrics:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._requests_total: dict[str, int] = {}  # status -> count
        self._buckets: dict[str, dict[str, int]] = {}  # route -> le -> count
        self._duration_sum: dict[str, float] = {}  # route -> seconds
        self._errors_total: dict[str, int] = {}
        self._started = time.time()

    def observe(self, route: str, status: int, seconds: float) -> None:
        with self._lock:
            key = str(status)
            self._requests_total[key] = self._requests_total.get(key, 0) + 1
            if status >= 500:
                self._errors_total[key] = self._errors_total.get(key, 0) + 1
            buckets = self._buckets.setdefault(route, {})
            for le in _BUCKETS:
                if seconds <= le:
                    buckets[str(le)] = buckets.get(str(le), 0) + 1
            self._duration_sum[route] = self._duration_sum.get(route, 0.0) + seconds

    def render(self, engine_loaded: bool) -> str:
        with self._lock:
            requests = dict(self._requests_total)
            errors = dict(self._errors_total)
            buckets = {r: dict(b) for r, b in self._buckets.items()}
            duration_sum = dict(self._duration_sum)
            uptime = time.time() - self._started

        lines = [
            "# HELP brabo_ocr_requests_total Total OCR requests by HTTP status.",
            "# TYPE brabo_ocr_requests_total counter",
        ]
        for status, count in sorted(requests.items()):
            lines.append(f'brabo_ocr_requests_total{{status="{status}"}} {count}')

        lines += [
            "# HELP brabo_ocr_errors_total Total 5xx OCR requests.",
            "# TYPE brabo_ocr_errors_total counter",
        ]
        for status, count in sorted(errors.items()):
            lines.append(f'brabo_ocr_errors_total{{status="{status}"}} {count}')

        lines += [
            "# HELP brabo_ocr_request_duration_seconds OCR latency histogram.",
            "# TYPE brabo_ocr_request_duration_seconds histogram",
        ]
        for route, bucket_map in sorted(buckets.items()):
            for le, count in sorted(bucket_map.items(), key=lambda kv: float(kv[0])):
                lines.append(
                    f'brabo_ocr_request_duration_seconds_bucket{{route="{route}",le="{le}"}} {count}'
                )
            lines.append(f'brabo_ocr_request_duration_seconds_count{{route="{route}"}} {sum(bucket_map.values())}')
            lines.append(f'brabo_ocr_request_duration_seconds_sum{{route="{route}"}} {round(duration_sum.get(route, 0.0), 4)}')

        lines += [
            "# HELP brabo_ocr_engine_loaded Whether the OCR engine is loaded (1) or not (0).",
            "# TYPE brabo_ocr_engine_loaded gauge",
            f"brabo_ocr_engine_loaded {1 if engine_loaded else 0}",
            "# HELP brabo_ocr_uptime_seconds Process uptime.",
            "# TYPE brabo_ocr_uptime_seconds gauge",
            f"brabo_ocr_uptime_seconds {round(uptime, 2)}",
        ]
        return "\n".join(lines) + "\n"


metrics = Metrics()
