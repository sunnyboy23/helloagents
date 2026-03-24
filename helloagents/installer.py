"""Backward-compatible installer API shim.

This module preserves legacy import paths (``helloagents.installer``)
while the implementation lives under ``helloagents.core``.
"""

from .core.installer import (
    _deploy_agent_files,
    clean_stale_files,
    install,
    install_all,
)
from .core.uninstaller import (
    _remove_agent_files,
    _self_uninstall,
    uninstall,
    uninstall_all,
)

__all__ = [
    "_deploy_agent_files",
    "_remove_agent_files",
    "_self_uninstall",
    "clean_stale_files",
    "install",
    "install_all",
    "uninstall",
    "uninstall_all",
]
