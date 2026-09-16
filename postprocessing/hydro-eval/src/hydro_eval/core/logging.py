# src/hydro_eval/core/logging.py
from __future__ import annotations

import logging
import logging.config
from dataclasses import dataclass
from pathlib import Path

@dataclass(frozen=True)
class LoggingConfig:
    """Logging configuration.

    Attributes:
        level: Console log level (INFO recommended by default).
        log_dir: If provided, write a detailed log file into this directory.
        filename: Log file name (inside log_dir).
    """
    level: str = "INFO"
    log_dir: Path | None = None
    filename: str = "hydro-eval.log"

def setup_logging(cfg: LoggingConfig) -> None:
    """Configure logging for the whole application.
    
    Design goals:
        - Console output should be consice (INFO by default).
        - File log (if enabled) should capture DEBUG for troubleshooting.
        - No prints in the pipeline; use logging instead.
    """
    level = (cfg.level or "INFO").upper()

    handlers: dict[str, dict] = {
        "console": {
            "class": "logging.StreamHandler",
            "level": level,
            "formatter": "standard",
        }
    }

    root_handlers = ["console"]

    if cfg.log_dir is not None:
        cfg.log_dir.mkdir(parents=True, exist_ok=True)
        logfile = cfg.log_dir / cfg.filename
        handlers["file"] = {
            "class": "logging.FileHandler",
            "level": "DEBUG",
            "formatter": "standard",
            "filename": str(logfile),
            "encoding": "utf-8",
        }
        root_handlers.append("file")

    logging_config = {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "standard": {
                "format": "%(asctime)s | %(levelname)s | %(name)s | %(message)s",
                "datefmt": "%Y-%m-%d %H:%M:%S",
            }
        },
        "handlers": handlers,
        "root": {
            "level": "DEBUG", # root stays at DEBUG; handlers control what you see
            "handlers": root_handlers,
        },
    }
    logging.config.dictConfig(logging_config)