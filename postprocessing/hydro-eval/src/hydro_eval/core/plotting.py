# src/hydro_eval/core/plotting.py
from __future__ import annotations

import logging
from enum import Enum
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Tuple
import matplotlib.pyplot as plt
import matplotlib.figure as mplfig

logger = logging.getLogger(__name__)


class ThemeColor(str, Enum):
    """Semantic colors for common climate experiment labels.

    Note:
        Intentionally kept this small and stable.
        Unknown labels will fall back to matplotlib's default cycle.
    """

    BASELINE = "black"
    SSP126 = "green"
    SSP245 = "orange"
    SSP585 = "red"


def color_for_experiment(
    experiment: Optional[str], *, is_reference: bool = False
) -> Optional[str]:
    """Return a preferred color for a given experment string.

    Returns:
        - a matplotlib color string (e.g., "orange") when known
        - None when unknown (caller can use matplotlib defaults)

    Rules:
        - reference curve is always black (semantic baseline)
        - targets get htematic colors if recognized (ssp126=green, ssp245=orange, ssp585=red)
        - otherwise None
    """
    exp = (experiment or "").strip().lower()

    if is_reference:
        return ThemeColor.BASELINE.value

    # Match common SSP folder names
    if exp == "ssp126":
        return ThemeColor.SSP126.value
    elif exp == "ssp245":
        return ThemeColor.SSP245.value
    elif exp == "ssp585":
        return ThemeColor.SSP585.value
    else:
        logger.debug(f"Unknown experiment '{experiment}' - using default color.")
        return None


@dataclass(frozen=True)
class PlotStyle:
    """Central plot style (fonts, legend placement, export dpi, etc.)."""

    font_size: int = 9
    axes_labelsize: int = 7
    axes_titlesize: int = 9
    tick_labelsize: int = 7
    legend_fontsize: int = 7

    legend_loc: str = "lower center"
    legend_ncol: int = 3
    legend_bbox_to_anchor: Tuple[float, float] = (0.5, 0.0)
    legend_frame_on: bool = False

    tight_layout_rect: Tuple[float, float, float, float] = (
        0.0,
        0.05,
        1.0,
        1.0,
    )  # left, bottom, right, top
    dpi: int = 300

    def apply(self) -> None:
        """Apply rcParams glboally (call once per run, or before plotting)."""
        plt.rcParams.update(
            {
                "font.size": self.font_size,
                "axes.labelsize": self.axes_labelsize,
                "axes.titlesize": self.axes_titlesize,
                "xtick.labelsize": self.tick_labelsize,
                "ytick.labelsize": self.tick_labelsize,
                "legend.fontsize": self.legend_fontsize,
            }
        )


def legend_bottom(
    fig, handles, labels, *, style: PlotStyle, ncol: int | None = None
) -> None:
    """Place a legend below plot area."""
    fig.legend(
        handles=handles,
        labels=labels,
        loc=style.legend_loc,
        ncol=style.legend_ncol if ncol is None else ncol,
        bbox_to_anchor=style.legend_bbox_to_anchor,
        frameon=style.legend_frame_on,
    )


def save_figure(fig: mplfig.Figure, out_path: Path, *, style: PlotStyle) -> None:
    """Save figure with consistent style settings."""
    fig.tight_layout(rect=style.tight_layout_rect)
    fig.savefig(out_path, dpi=style.dpi)
    logger.debug(f"Saved figure to {out_path} with dpi={style.dpi}.")
