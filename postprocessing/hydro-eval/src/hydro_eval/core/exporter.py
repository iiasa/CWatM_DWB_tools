# src/hydro_eval/core/exporter.py
from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

@dataclass(frozen=True)
class ExportPaths:
    """Standard output directories."""
    root: Path
    tables: Path
    figures: Path


@dataclass
class Exporter:
    """Centralised export helper.
    
    Design goals:
        - Kepp indicators free of filesystem boilerplate.
        - Provide consistent output layout and filenames.
        - Log only important actions (INFO), detailed paths on DEBUG.
    """
    out_root: Path

    def __post_init__(self) -> None:
        self.out_root = Path(self.out_root)
        

    def paths(self) -> ExportPaths:
        """Get standard export paths without creating directories. Use ensure_base_dirs() to create them if needed."""
        tables = self.out_root / "tables"
        figures = self.out_root / "figures"
        return ExportPaths(root=self.out_root, tables=tables, figures=figures)
    
    def ensure_base_dirs(self) -> ExportPaths:
        """Ensure baseline export directories exist and return their paths."""
        paths = self.paths()
        paths.root.mkdir(parents=True, exist_ok=True)
        paths.tables.mkdir(parents=True, exist_ok=True)
        paths.figures.mkdir(parents=True, exist_ok=True)
        logger.debug(f"Export directories ensured at: root={paths.root} | tables={paths.tables} | figures={paths.figures}")
        return paths
    
    def table_path(
            self,
            name: str,
            *,
            dataset: Optional[str] = None,
            experiment: Optional[str] = None,
            station: Optional[str] = None,
            window: Optional[str] = None,
            ext: str = "csv"
            ) -> Path:
        """Generate a consistent table export path based on provided metadata."""
        base = self.ensure_base_dirs().tables / name[0]
        base.mkdir(parents=True, exist_ok=True)

        parts = [name]
        if dataset:
            parts.append(f"ds-{dataset}")
        if experiment:
            parts.append(f"exp-{experiment}")
        if station:
            parts.append(f"st-{station}")
        if window:
            parts.append(f"win-{window}")

        filename = "_".join(parts) + f".{ext.lstrip('.')}"
        path  = base / filename
        logger.debug(f"Generated table path: {path} | metadata: dataset={dataset}, experiment={experiment}, station={station}, window={window}")
        return path
    
    def figure_path(
            self,
            name: str,
            *,
            dataset: Optional[str] = None,
            experiment: Optional[str] = None,
            station: Optional[str] = None,
            window: Optional[str] = None,
            ext: str = "png"
            ) -> Path:
        """Generate a consistent figure export path based on provided metadata."""
        base = self.ensure_base_dirs().figures / name
        base.mkdir(parents=True, exist_ok=True)

        parts = [name]
        if dataset:
            parts.append(f"ds-{dataset}")
        if experiment:
            parts.append(f"exp-{experiment}")
        if station:
            parts.append(f"st-{station}")
        if window:
            parts.append(f"win-{window}")

        filename = "_".join(parts) + f".{ext.lstrip('.')}"
        path  = base / filename
        logger.debug(f"Generated figure path: {path} | metadata: dataset={dataset}, experiment={experiment}, station={station}, window={window}")
        return path