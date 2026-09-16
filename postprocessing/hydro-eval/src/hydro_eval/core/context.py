# src/hydro_eval/core/context.py
from __future__ import annotations
from typing import Dict

from dataclasses import dataclass

from hydro_eval.core.timewindow import TimeWindow
from hydro_eval.core.exporter import Exporter

@dataclass(frozen=True)
class RunContext:
    """Context passed into indicators."""
    exporter: Exporter
    baseline: TimeWindow
    future: TimeWindow
    b2_min_event_days: int