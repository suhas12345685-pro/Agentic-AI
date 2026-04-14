"""
Structured logger for the cognition layer.

Every thought, action, observation and reflection is funneled through
``get_logger("...")``.  A single root handler formats the record as:

    [timestamp][LEVEL][cognition:module] message

so log output can be grepped for transparency.
"""

from __future__ import annotations

import logging
import os
import sys
from typing import Optional

_ROOT_NAME = "cognition"
_CONFIGURED = False


def _configure_root(level: int) -> None:
    global _CONFIGURED
    if _CONFIGURED:
        return

    root = logging.getLogger(_ROOT_NAME)
    root.setLevel(level)
    root.propagate = False

    handler = logging.StreamHandler(stream=sys.stdout)
    handler.setFormatter(
        logging.Formatter(
            fmt="[%(asctime)s][%(levelname)s][%(name)s] %(message)s",
            datefmt="%H:%M:%S",
        )
    )
    root.addHandler(handler)
    _CONFIGURED = True


def get_logger(module: str, level: Optional[int] = None) -> logging.Logger:
    """
    Return a namespaced logger, e.g. ``cognition:reasoning.engine``.

    The level can be overridden via the ``COGNITION_LOG_LEVEL`` env var
    (DEBUG / INFO / WARNING / ERROR).  Default is INFO.
    """
    env_level = os.environ.get("COGNITION_LOG_LEVEL", "INFO").upper()
    resolved = level if level is not None else getattr(logging, env_level, logging.INFO)
    _configure_root(resolved)
    return logging.getLogger(f"{_ROOT_NAME}:{module}")
