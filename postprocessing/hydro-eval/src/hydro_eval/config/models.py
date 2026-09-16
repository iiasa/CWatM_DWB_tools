# src/hydro_eval/config/models.py
from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any, List, Dict

try:
    import tomllib  # Python 3.11+
except ModuleNotFoundError:
    import tomli as tomllib  # type: ignore

logger = logging.getLogger(__name__)

# ----------------------------
# Dataclasses (typed config)
# ----------------------------

@dataclass(frozen=True)
class Period:
    start: str  # ISO date string, e.g. "2000-01-01"
    end: str    # ISO date string, e.g. "2010-12-31"


@dataclass(frozen=True)
class Paths:
    """Project paths resolved relative to the config file location."""
    data_root: Path
    out_root: Path


@dataclass(frozen=True)
class Parameters:
    """Input file naming etc."""
    variable_file: str


@dataclass(frozen=True)
class Comparison:
    reference_experiment: str  # e.g. "historical"
    target_experiments: List[str] | None # e.g. ["ssp126", "ssp585"]


@dataclass(frozen=True)
class IndicatorFlags:
    enabled: Dict[str, bool]  # e.g. {"A1": true, "B2": false}


@dataclass(frozen=True)
class B2Config:
    """Config specific to B2 indicator."""
    min_event_days: int = 3


@dataclass(frozen=True)
class IndicatorParams:
    """Configuration container for indicator-specific parameters."""
    B2: B2Config = B2Config()


@dataclass(frozen=True)
class AppConfig:
    """Top-level application configuration."""
    name: str
    logging_level: str
    paths: Paths
    periods: Dict[str, Period]  # baseline/future for now
    parameters: Parameters
    indicators: IndicatorFlags # enable/disable by id, e.g. "A1": true
    config_path: Path           # absolute path to config.toml
    config_dir: Path            # directory containing the config.toml
    comparison: Comparison 
    indicator_params: IndicatorParams
# ----------------------------
# Helpers
# ----------------------------
def _require_section(raw: Dict[str, Any], key: str) -> Dict[str, Any]:
    """Helper to extract and validate a required section from the raw config."""
    if key not in raw or not isinstance(raw[key], dict):
        raise KeyError(f"Missing required section '{key}' in config.")
    return raw[key]

def _resolve_path(value: str, base_dir: Path) -> Path:
    """Resolve path relative to config file directory (NOT current working dir)."""
    p = Path(value)
    if not p.is_absolute():
        p = (base_dir / p).resolve()
    return p

# ----------------------------
# Public API
# ----------------------------

def load_config(path: str | Path) -> AppConfig:
    """Load TOML config and return a typed AppConfig.

    Key design choices:
        - All relative paths are resolved relative to the config file location. This makes CLI execution robust from any working directory.
    """
    cfg_path = Path(path).expanduser().resolve()
    with cfg_path.open("rb") as f:
        raw: dict[str, Any] = tomllib.load(f)

    cfg_dir = cfg_path.parent

    project = raw.get("project", {} )
    name = str(project.get("name", "hydro-eval"))
    logging_level = str(project.get("logging_level", "INFO")).upper()

    paths_raw = _require_section(raw, "paths")
    data_root = _resolve_path(str(paths_raw.get("data_root", "./data")), cfg_dir)
    out_root = _resolve_path(str(paths_raw.get("out_root", "./outputs")), cfg_dir)

    periods_raw = _require_section(raw, "periods")
    #! For now: keep it simple with baseline + future. Will be generalised later if needed.
    baseline = periods_raw.get("baseline")
    future = periods_raw.get("future")
    if not (isinstance(baseline, (list, tuple)) and len(baseline) == 2):
        raise ValueError("Config [periods].baseline must be [start, end].")
    if not (isinstance(future, (list, tuple)) and len(future) == 2):
        raise ValueError("Config [periods].future must be [start, end].")
    
    periods = {
        "baseline": Period(start=str(baseline[0]), end=str(baseline[1])),
        "future": Period(start=str(future[0]), end=str(future[1])),
    }

    params_raw = _require_section(raw, "parameters")

    comparison_raw = _require_section(raw, "comparison")
    if not isinstance(comparison_raw, dict):
        raise ValueError("Config [comparison] must be a table/dict.")
    
    ref_exp = str(comparison_raw.get("reference_experiment", "historical")).strip()
    targets = comparison_raw.get("target_experiments", None)

    target_experiments: List[str] | None
    if targets is None:
        target_experiments = None
    else:
        if not isinstance(targets, list) or not all(isinstance(x, str) for x in targets):
            raise ValueError("Config [comparison].target_experiments must be a list of strings.")
        target_experiments = [x.strip() for x in targets if x.strip()]
        if not target_experiments:
            target_experiments = None


    variable_q = str(params_raw.get("variable_q", "discharge_daily.csv"))

    indicators_raw = raw.get("indicators", {})
    if not isinstance(indicators_raw, dict):
        raise ValueError("Config [indicators] must be a table/dict.")
    
    enabled: Dict[str, bool] = {}
    for key, value in indicators_raw.items():
        if isinstance(value, bool):
            enabled[str(key).strip()] = value

    indicator_params_raw = raw.get("indicator_params", {})

    b2_cfg = B2Config(
        min_event_days=int(indicator_params_raw.get("B2", {}).get("min_event_days", 3))
    )
    cfg = AppConfig(
        name=name,
        logging_level=logging_level,
        paths=Paths(data_root=data_root, out_root=out_root),
        periods=periods,
        parameters=Parameters(variable_file=variable_q),
        indicators=IndicatorFlags(enabled=enabled),
        config_path=cfg_path,
        config_dir=cfg_dir,
        comparison=Comparison(reference_experiment=ref_exp, target_experiments=target_experiments),
        indicator_params=IndicatorParams(B2=b2_cfg)
    )

    logger.debug(f"Loaded config: {cfg} from {cfg_path}.")
    logger.debug(f"Resolved data_root: {cfg.paths.data_root}, out_root: {cfg.paths.out_root}.")
    return cfg