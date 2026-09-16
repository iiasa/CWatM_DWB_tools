# src/hydro_eval/indicators/A2_fdc.py
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import List, Tuple
import matplotlib.pyplot as plt
from pathlib import Path
import numpy as np
import pandas as pd

from hydro_eval.core.comparison import ComparisonView
from hydro_eval.core.context import RunContext
from hydro_eval.core.timewindow import slice_window
from hydro_eval.core.plotting import (
    PlotStyle,
    color_for_experiment,
    legend_bottom,
    save_figure,
)
from hydro_eval.indicators.base import IndicatorResult
from hydro_eval.core.stats import station_columns


logger = logging.getLogger(__name__)

style = PlotStyle()
style.apply()


@dataclass(frozen=True)
class _A2Row:
    dataset: str
    experiment: str
    window: str
    stations: str
    p0: float
    p5: float
    p15: float
    p25: float
    p50: float
    p75: float
    p85: float
    p95: float
    p100: float


def _annual_fdc(series: np.ndarray, p_exceed: np.ndarray) -> np.ndarray:
    """Compute one-year FDC as quantiles corresponding to given exceedance probabilities.

    FDC defined as flow exceeded p% of time.
    This corresponds to quantiles at p/100) probability.
    """
    x = pd.to_numeric(series, errors="coerce")

    if x.size == 0:
        return np.full_like(p_exceed, fill_value=np.nan, dtype=float)

    probs = 1 - p_exceed / 100.0
    # np.quantile ignores nan only if x already has no nan
    return np.quantile(x, probs)


def _median_annual_fdc(
    df: pd.DataFrame, station: str, p_exceed: np.ndarray
) -> np.ndarray:
    """Compute median FDC curve from all annual FDCs in df."""
    if df.empty:
        return np.full_like(p_exceed, fill_value=np.nan, dtype=float)

    years = df["date"].dt.year.unique()
    curves = []

    for year in sorted(years):
        s_year = df.loc[df["date"].dt.year == year, station]
        curves.append(_annual_fdc(s_year, p_exceed))  # type: ignore

    curves_arr = (
        np.vstack(curves)
        if curves
        else np.full((0, p_exceed.size), fill_value=np.nan, dtype=float)
    )
    if curves_arr.size == 0:
        return np.full_like(p_exceed, fill_value=np.nan, dtype=float)
    return np.nanmedian(curves_arr, axis=0)


def _pooled_fdc(df: pd.DataFrame, station: str, p_exceed: np.ndarray) -> np.ndarray:
    """Compute FDC by pooling all daily values from a period."""
    x = pd.to_numeric(df[station], errors="coerce").dropna().to_numpy()
    if x.size == 0:
        return np.full_like(p_exceed, fill_value=np.nan, dtype=float)
    probs = 1 - p_exceed / 100
    return np.quantile(x, probs)


def _annual_fdcs(df: pd.DataFrame, station: str, p_exceed: np.ndarray) -> np.ndarray:
    """Compute annual FDCs for each year in df."""
    years = df["date"].dt.year.unique()
    curves = []

    for year in years:
        x = (
            pd.to_numeric(df.loc[df["date"].dt.year == year, station], errors="coerce")
            .dropna()  # type: ignore
            .to_numpy()
        )
        if x.size == 0:
            curves.append(np.full_like(p_exceed, fill_value=np.nan, dtype=float))
        else:
            curves.append(_annual_fdc(x, p_exceed))

    if not curves:
        return np.full((0, p_exceed.size), fill_value=np.nan, dtype=float)

    return np.vstack(curves)


def _band_from_annual(
    curves: np.ndarray, lower_p: float = 25.0, upper_p: float = 75.0
) -> Tuple[np.ndarray, np.ndarray]:
    """Compute lower and upper band from annual curves."""
    if curves.shape[0] == 0:
        n = curves.shape[1] if curves.ndim == 2 else 0
        return np.full(n, np.nan), np.full(n, np.nan)
    lower = np.nanpercentile(curves, lower_p, axis=0)
    upper = np.nanpercentile(curves, upper_p, axis=0)
    return lower, upper


def _plot_fdc_with_band(
    out_path: Path,
    p_exceed: np.ndarray,
    series: List[
        Tuple[str, np.ndarray, Tuple[np.ndarray, np.ndarray] | None, str | None]
    ],  # List of (label, curve, (lower_band, upper_band) or None)
) -> None:
    """Plot FDC curves with optional IQR bands and save to PNG.

    series items:
        (label, curve, band_or_None, color_or_None)
    """

    fig, ax = plt.subplots(figsize=(7, 4))

    for label, curve, band, color in series:
        # for log-scale: hide non-positive values
        curve_plot = np.where(curve > 0, curve, np.nan)

        if band is not None:
            lower, upper = band
            lower_plot = np.where(lower > 0, lower, np.nan)
            upper_plot = np.where(upper > 0, upper, np.nan)
            if not (np.all(np.isnan(lower_plot)) or np.all(np.isnan(upper_plot))):
                alpha = 0.15 if label == "historical" else 0.25
                ax.fill_between(
                    p_exceed,
                    lower_plot,
                    upper_plot,
                    alpha=alpha,
                    label=f"{label} " + "(25-75$^{th}$ pct)",
                    color=color,
                    linewidth=0,
                )

        ax.plot(
            p_exceed,
            curve_plot,
            label=f"{label} " + "(50$^{th}$ pct)",
            color=color,
            linewidth=1.25,
        )

    leg_line, leg_label = ax.get_legend_handles_labels()
    ax.set_yscale("log")
    ax.set_xlabel("Exceedance Probability (%)")
    ax.set_ylabel("Discharge, log (m$^{3}$/s)")
    ax.grid(True)
    legend_bottom(fig, leg_line, leg_label, style=style, ncol=4)
    # fig.legend(
    #     leg_line,
    #     leg_label,
    #     loc="lower center",
    #     ncol=4,
    #     bbox_to_anchor=(0.5, 0),
    #     frameon=False,
    #     )
    # fig.tight_layout(rect=(0, 0.05, 1, 1))
    save_figure(fig, out_path, style=style)
    plt.close(fig)


class A2Indicator:
    """A2: Flow Duration Curve (FDC) - median of annual FDCs."""

    id = "A2"

    def run(self, view: ComparisonView, ctx: RunContext) -> IndicatorResult:
        # Exceedance probabilities for FDC in percent
        p_exceed_tbl = np.array([0, 5, 15, 25, 50, 75, 85, 95, 100], dtype=float)
        p_exceed_plt = np.arange(0, 101, 1, dtype=float)

        rows: List[_A2Row] = []

        def _process(
            dataset: str, experiment: str, window: str, df: pd.DataFrame
        ) -> None:
            stations = station_columns(df)
            if not stations:
                logger.warning(
                    f"A2: {dataset=} {experiment=} {window=} has no station columns. Skipping."
                )
                return

            for station in stations:
                curve = _pooled_fdc(df, station, p_exceed_tbl)
                if np.all(np.isnan(curve)):
                    logger.warning(
                        f"A2: {dataset=} {experiment=} {window=} {station=} has no valid flow data for FDC calculation."
                    )
                    continue

                rows.append(
                    _A2Row(
                        dataset=dataset,
                        experiment=experiment,
                        window=window,
                        stations=station,
                        **{
                            f"p{int(p)}": float(f"{q:.3f}")
                            for p, q in zip(p_exceed_tbl, curve)
                        },
                    )
                )

        # reference -> baseline
        for dataset, comp in view.items():
            ref_exp = comp.reference.scenario.experiment
            ref_df = slice_window(comp.reference.df, ctx.baseline)
            _process(dataset, ref_exp, ctx.baseline.name, ref_df)

        # targets -> future
        for dataset, comp in view.items():
            for exp, target in comp.targets.items():
                tgt_df = slice_window(target.df, ctx.future)
                _process(dataset, exp, ctx.future.name, tgt_df)

        if not rows:
            logger.warning("A2: no outputs generated.")
            return IndicatorResult(id=self.id, n_outputs=0)

        out_df = pd.DataFrame([row.__dict__ for row in rows])
        out_df = out_df.sort_values(by=["dataset", "experiment"]).reset_index(drop=True)

        out_path = ctx.exporter.table_path(
            name=self.id,
        )
        out_df.to_csv(out_path, index=False)
        logger.info(f"A2 table exported: {out_path} | rows={len(out_df)}")

        n_fig = 0
        for dataset, comp in view.items():
            # reference baseline
            ref_df = slice_window(comp.reference.df, ctx.baseline)
            stations = station_columns(ref_df)
            if not stations:
                continue

            # compute reference once per station
            for station in stations:
                ref_curve = _median_annual_fdc(ref_df, station, p_exceed_plt)
                ref_annual = _annual_fdcs(ref_df, station, p_exceed_plt)
                re_band = _band_from_annual(ref_annual)

                # For each target experiment -> separate figure
                for exp, target in comp.targets.items():
                    tgt_df = slice_window(target.df, ctx.future)

                    if station not in tgt_df.columns:
                        logger.warning(
                            f"A2: {dataset=} target {exp} has no column for station {station}. Skipping FDC plot for this station."
                        )
                        continue

                    tgt_curve = _median_annual_fdc(tgt_df, station, p_exceed_plt)
                    tgt_annual = _annual_fdcs(tgt_df, station, p_exceed_plt)
                    tgt_band = _band_from_annual(tgt_annual)

                    ref_color = color_for_experiment(
                        comp.reference.scenario.experiment, is_reference=True
                    )
                    tgt_color = color_for_experiment(exp, is_reference=False)

                    series = [
                        (
                            f"{comp.reference.scenario.experiment}",
                            ref_curve,
                            re_band,
                            ref_color,
                        ),
                        ((f"{exp}", tgt_curve, tgt_band, tgt_color)),
                    ]

                    out_path = ctx.exporter.figure_path(
                        name=self.id,
                        dataset=dataset,
                        experiment=exp,
                        station=station,
                    )
                    _plot_fdc_with_band(out_path, p_exceed_plt, series)  # type: ignore
                    n_fig += 1
        logger.info(f"A2 FDC plots exported: {n_fig}")

        return IndicatorResult(id=self.id, n_outputs=1)
