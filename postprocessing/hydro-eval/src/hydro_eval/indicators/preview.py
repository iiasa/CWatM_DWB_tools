# src/hydro_eval/indicators//preview.py
from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import List
import pandas as pd

from hydro_eval.core.comparison import ComparisonView
from hydro_eval.core.context import RunContext
from hydro_eval.core.timewindow import slice_window
from hydro_eval.indicators.base import IndicatorResult

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class PreviewResult:
    """Preview outputs produced by the preview indicator."""

    written_files: List[Path]


class PreviewIndicator:
    """Diagnostic indicator: exports head() of loaded scenarios.

    Why:
        - Validate IO layer and --profile slicing without spamming console output.
    """

    id = "preview"

    def run(self, view: ComparisonView, ctx: RunContext) -> IndicatorResult:
        out_dir = ctx.exporter.out_root / "tables" / "preview"
        out_dir.mkdir(parents=True, exist_ok=True)

        written: List[Path] = []

        def _export(key: str, df: pd.DataFrame, window_name: str) -> None:
            if df.empty:
                logger.info(
                    f"Preview export skipped (empty DataFrame): {key} | window={window_name}"
                )
                return
            out_path = ctx.exporter.table_path(
                name=self.id,
                dataset=dataset,
                experiment=key.split("_")[2],  # crude parsing, but should work for now
                station=None,  # pokud budeš chtít, můžeme do ctx přidat station
                window=window_name,
                ext="csv",
            )
            df.head(10).to_csv(out_path, index=False)
            written.append(out_path)
            logger.info(
                f"Preview export: {key} | window={window_name} | shape={df.shape} | columns={list(df.columns)}"
            )

        for dataset, comp in view.items():
            # reference / baseline
            ref_key = f"{dataset}_ref_{comp.reference.scenario.experiment}"

            ref_base = slice_window(comp.reference.df, ctx.baseline)

            _export(ref_key, ref_base, "baseline")

            logger.info(
                f"Preview (ref): {ref_key} | shape={comp.reference.df.shape} | columns={list(comp.reference.df.columns)}",
            )
            # targets
            for experiment, target in comp.targets.items():
                tgt_key = f"{dataset}_tgt_{experiment}"

                tgt_fut = slice_window(target.df, ctx.future)

                _export(tgt_key, tgt_fut, "future")

                logger.info(
                    f"Preview (tgt): {tgt_key} | shape={target.df.shape} | columns={list(target.df.columns)}",
                )

        logger.info(
            f"Preview export complete. {len(written)} files written to {out_dir}"
        )

        return IndicatorResult(id=self.id, n_outputs=len(written))
