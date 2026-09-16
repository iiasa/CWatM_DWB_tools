# src/hydro_eval/indicators/A3_mts.py
from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

from hydro_eval.core.comparison import ComparisonView
from hydro_eval.core.context import RunContext
from hydro_eval.core.plotting import (
    color_for_experiment,
    PlotStyle,
    legend_bottom,
    save_figure,
)
from hydro_eval.core.timewindow import slice_window, slice_between
from hydro_eval.indicators.base import IndicatorResult


logger = logging.getLogger(__name__)


style = PlotStyle()
style.apply()


@dataclass(frozen=True)
class _TrendRow:
    dataset: str
    experiment: str
    window: str
    station: str
    slope_per_year: float
    r2: float
    n_months: int
    start: str
    end: str


def _station_columns(df: pd.DataFrame) -> list[str]:
    return [c for c in df.columns if c != "date"]


def _monthly_mean(df: pd.DataFrame, station: str) -> pd.DataFrame:
    """Return DataFrame with columns: date (month-start), value."""
    x = df[["date", station]].copy()
    x[station] = pd.to_numeric(x[station], errors="coerce")
    x = x.dropna(subset=[station])
    if x.empty:
        return pd.DataFrame(columns=["date", "value"])

    # month-start timestamps
    x["month"] = x["date"].dt.to_period("M").dt.to_timestamp()
    g = x.groupby("month", as_index=False)[station].mean()
    g = g.rename(columns={"month": "date", station: "value"})  # type:ignore
    return g.sort_values("date").reset_index(drop=True)


def _linear_trend(monthly: pd.DataFrame) -> tuple[float, float]:
    """Return slope_per_year and R^2 for y ~ t."""
    if monthly.empty or monthly.shape[0] < 3:
        return float("nan"), float("nan")

    # time in years from start
    t = (monthly["date"] - monthly["date"].iloc[0]).dt.days.to_numpy(
        dtype=float
    ) / 365.25
    y = monthly["value"].to_numpy(dtype=float)

    # OLS via polyfit
    slope, intercept = np.polyfit(t, y, 1)
    y_hat = slope * t + intercept

    ss_res = np.sum((y - y_hat) ** 2)
    ss_tot = np.sum((y - np.mean(y)) ** 2)
    r2 = 1.0 - (ss_res / ss_tot) if ss_tot > 0 else float("nan")

    return float(slope), float(r2)


def _plot_mts(
    out_path: Path,
    series: list[dict[str, object]],
) -> None:
    """Plot monthly time series + linear trend line."""
    fig, ax = plt.subplots(figsize=(6.3, 3.5))  # A4 landscape-ish

    for item in series:
        label = item["label"]
        full = item["monthly_full"]
        win = item["monthly_win"]
        color = item.get("color", "black")

        if isinstance(full, pd.DataFrame) and not full.empty:
            ax.plot(
                full["date"],
                full["value"],
                label=f"Monthly discharge ({str(label).split('-')[0]})",
                color="dimgray",
                linewidth=1.0,
            )

        # trend
        if isinstance(win, pd.DataFrame) and not win.empty and win.shape[0] >= 3:
            # Fit on window
            t = (win["date"] - win["date"].iloc[0]).dt.days.to_numpy(
                dtype=float
            ) / 365.25
            y = win["value"].to_numpy(dtype=float)
            s, b = np.polyfit(t, y, 1)

            y_hat = s * t + b
            slope_label = (
                f"Trend ({str(label).split('-')[-1]}): {s:+.2f} m$^{{3}}$/s/yr"
            )
            ax.plot(
                win["date"],
                y_hat,
                linestyle="--",
                label=slope_label,
                color=color,
                linewidth=1.5,
            )

    ax.set_ylabel("Monthly mean discharge (m$^{3}$/s)")
    ax.grid(True)
    handles, labels = ax.get_legend_handles_labels()
    uniq = dict(zip(labels, handles))  # preserve order, remove duplicates
    legend_bottom(fig, list(uniq.values()), list(uniq.keys()), style=style)
    save_figure(fig, out_path, style=style)
    plt.close(fig)


class A3Indicator:
    """A3: Monthly Time Series + Trend (MTS)."""

    id = "A3"

    def run(self, view: ComparisonView, ctx: RunContext) -> IndicatorResult:
        trend_rows: list[_TrendRow] = []
        mts_rows: list[dict[str, object]] = []

        # Precompute reference baseline monthly per dataset/station for plotting
        ref_monthly_map: dict[tuple[str, str], pd.DataFrame] = {}

        # ---- Reference baseline
        for dataset, comp in view.items():
            ref_exp = comp.reference.scenario.experiment
            ref_df = slice_window(comp.reference.df, ctx.baseline)

            for st in _station_columns(ref_df):
                monthly = _monthly_mean(ref_df, st)
                ref_monthly_map[(dataset, st)] = monthly

                slope, r2 = _linear_trend(monthly)
                trend_rows.append(
                    _TrendRow(
                        dataset=dataset,
                        experiment=ref_exp,
                        window=ctx.baseline.name,
                        station=st,
                        slope_per_year=slope,
                        r2=r2,
                        n_months=int(monthly.shape[0]),
                        start=str(ctx.baseline.start.date()),
                        end=str(ctx.baseline.end.date()),
                    )
                )

                for _, row in monthly.iterrows():
                    mts_rows.append(
                        {
                            "dataset": dataset,
                            "experiment": ref_exp,
                            "window": ctx.baseline.name,
                            "station": st,
                            "date": row["date"],
                            "value": float(row["value"]),
                        }
                    )

        # ---- Targets future + per-target plots
        n_fig = 0
        for dataset, comp in view.items():
            ref_exp = comp.reference.scenario.experiment

            # stations defined by reference baseline (so plots are consistent)
            stations = [st for (ds, st) in ref_monthly_map.keys() if ds == dataset]

            for exp, target in comp.targets.items():
                tgt_df = slice_window(target.df, ctx.future)

                for st in stations:
                    if st not in tgt_df.columns:
                        logger.warning(
                            "A3: ds=%s st=%s missing in target=%s. Skipping.",
                            dataset,
                            st,
                            exp,
                        )
                        continue

                    monthly_tgt = _monthly_mean(tgt_df, st)
                    slope, r2 = _linear_trend(monthly_tgt)

                    trend_rows.append(
                        _TrendRow(
                            dataset=dataset,
                            experiment=exp,
                            window=ctx.future.name,
                            station=st,
                            slope_per_year=slope,
                            r2=r2,
                            n_months=int(monthly_tgt.shape[0]),
                            start=str(ctx.future.start.date()),
                            end=str(ctx.future.end.date()),
                        )
                    )

                    for _, row in monthly_tgt.iterrows():
                        mts_rows.append(
                            {
                                "dataset": dataset,
                                "experiment": exp,
                                "window": ctx.future.name,
                                "station": st,
                                "date": row["date"],
                                "value": float(row["value"]),
                            }
                        )

                    # Plot baseline + this target (one figure per target)
                    # ref_monthly = ref_monthly_map.get((dataset, st), pd.DataFrame())
                    # series = [
                    #     (f"{ref_exp} ({ctx.baseline.name})", ref_monthly, color_for_experiment(ref_exp, is_reference=True)),
                    #     (f"{exp} ({ctx.future.name})", monthly_tgt, color_for_experiment(exp, is_reference=False)),
                    # ]

                    out_path = ctx.exporter.figure_path(
                        name=self.id,
                        dataset=dataset,
                        experiment=exp,
                        station=st,
                        ext="png",
                    )

                    ref_full = _monthly_mean(
                        slice_between(
                            comp.reference.df, ctx.baseline.start, ctx.future.end
                        ),
                        st,
                    )
                    ref_win = _monthly_mean(
                        slice_window(comp.reference.df, ctx.baseline), st
                    )

                    tgt_full = _monthly_mean(
                        slice_between(target.df, ctx.baseline.start, ctx.future.end), st
                    )
                    tgt_win = _monthly_mean(slice_window(target.df, ctx.future), st)

                    series = [
                        {
                            "label": f"{dataset}-{ref_exp}",
                            "monthly_full": ref_full,
                            "monthly_win": ref_win,
                            "color": color_for_experiment(ref_exp, is_reference=True),
                        },
                        {
                            "label": f"{dataset}-{exp}",
                            "monthly_full": tgt_full,
                            "monthly_win": tgt_win,
                            "color": color_for_experiment(exp, is_reference=False),
                        },
                    ]
                    _plot_mts(out_path, series)
                    n_fig += 1

        # ---- Export tables
        n_out = 0

        if mts_rows:
            mts_df = pd.DataFrame(mts_rows)
            mts_df = mts_df.sort_values(
                ["dataset", "station", "experiment", "window", "date"]
            ).reset_index(drop=True)
            out_path = ctx.exporter.table_path(name=self.id, ext="csv")
            mts_df.to_csv(out_path, index=False)
            logger.info(
                "A3 exported monthly table: %s | rows=%d", out_path, len(mts_df)
            )
            n_out += 1

        if trend_rows:
            trend_df = pd.DataFrame([r.__dict__ for r in trend_rows])
            trend_df = trend_df.sort_values(
                ["dataset", "station", "experiment", "window"]
            ).reset_index(drop=True)
            out_path = ctx.exporter.table_path(name=f"{self.id}", ext="csv")
            trend_df.to_csv(out_path, index=False)
            logger.info(
                "A3 exported trend table: %s | rows=%d", out_path, len(trend_df)
            )
            n_out += 1

        logger.info("A3 exported figures: %d", n_fig)
        return IndicatorResult(id=self.id, n_outputs=n_out + n_fig)
