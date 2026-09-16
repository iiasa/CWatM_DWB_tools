# src/hydro_eval/indicators/base.py
from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from hydro_eval.core.comparison import ComparisonView
from hydro_eval.core.context import RunContext


@dataclass(frozen=True)
class IndicatorResult:
    """Generic indicator result metadata."""

    id: str
    n_outputs: int


class Indicator(Protocol):
    """Protocol every indicator must implement."""

    id: str

    def run(self, view: ComparisonView, ctx: RunContext) -> IndicatorResult: ...
