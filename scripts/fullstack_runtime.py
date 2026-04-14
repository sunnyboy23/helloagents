#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Fullstack runtime/config path resolver.

统一全局根路径策略：
1. 环境变量 HELLOAGENTS_FULLSTACK_RUNTIME_ROOT（最高优先级）
2. 全局配置 ~/.helloagents/helloagents.json 中 FULLSTACK_RUNTIME_ROOT
3. 回退到项目知识库目录 {KB_ROOT}/fullstack/tasks

当使用 1/2（用户目录）时，按项目路径哈希隔离：
{FULLSTACK_RUNTIME_ROOT}/{project_hash}/fullstack/tasks/current.json

全栈配置路径策略（双路径兼容）：
1. 环境变量 HELLOAGENTS_FULLSTACK_CONFIG_ROOT（最高优先级）
2. 全局配置 ~/.helloagents/helloagents.json 中 FULLSTACK_CONFIG_ROOT
3. 若显式设置 FULLSTACK_RUNTIME_ROOT，则默认派生到
   {FULLSTACK_RUNTIME_ROOT}/config/fullstack.yaml
4. 默认 ~/.helloagents/fullstack/config/fullstack.yaml
5. 若 1~4 不存在，回退到旧路径 {KB_ROOT}/fullstack/fullstack.yaml
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict

GLOBAL_CONFIG_FILE = Path.home() / ".helloagents" / "helloagents.json"
DEFAULT_GLOBAL_FULLSTACK_ROOT = Path.home() / ".helloagents" / "fullstack"
FULLSTACK_ROOT_MODE_PROJECT = "project"
FULLSTACK_ROOT_MODE_GLOBAL = "global"


def _read_global_config() -> Dict[str, Any]:
    try:
        if GLOBAL_CONFIG_FILE.is_file():
            return json.loads(GLOBAL_CONFIG_FILE.read_text(encoding="utf-8"))
    except Exception:
        pass
    return {}


def _write_global_config(config: Dict[str, Any]) -> None:
    GLOBAL_CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
    GLOBAL_CONFIG_FILE.write_text(
        json.dumps(config, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def _normalize_path(path: str) -> Path:
    return Path(path).expanduser().resolve()


def _get_configured_root_mode() -> str:
    """Return persisted root-mode preference."""
    env_mode = os.environ.get("HELLOAGENTS_FULLSTACK_ROOT_MODE", "").strip().lower()
    if env_mode in {FULLSTACK_ROOT_MODE_PROJECT, FULLSTACK_ROOT_MODE_GLOBAL}:
        return env_mode

    cfg = _read_global_config()
    mode = str(cfg.get("FULLSTACK_ROOT_MODE", "")).strip().lower()
    if mode in {FULLSTACK_ROOT_MODE_PROJECT, FULLSTACK_ROOT_MODE_GLOBAL}:
        return mode
    return ""


def _select_default_global_root() -> Path:
    """Return default fullstack global root for persisted global mode."""
    return DEFAULT_GLOBAL_FULLSTACK_ROOT


def _project_hash(project_root: Path) -> str:
    digest = hashlib.sha1(str(project_root).encode("utf-8")).hexdigest()
    return digest[:12]


def _get_configured_runtime_root() -> Path | None:
    """Return explicit fullstack root from env/config when configured."""
    env_runtime = os.environ.get("HELLOAGENTS_FULLSTACK_RUNTIME_ROOT", "").strip()
    if env_runtime:
        return _normalize_path(env_runtime)

    cfg = _read_global_config()
    cfg_runtime = str(cfg.get("FULLSTACK_RUNTIME_ROOT", "")).strip()
    if cfg_runtime:
        return _normalize_path(cfg_runtime)

    if _get_configured_root_mode() == FULLSTACK_ROOT_MODE_GLOBAL:
        return _select_default_global_root()

    return None


def _has_explicit_global_fullstack_target() -> bool:
    """Whether config resolution should prefer a global target even before creation."""
    env_mode = os.environ.get("HELLOAGENTS_FULLSTACK_ROOT_MODE", "").strip().lower()
    if env_mode == FULLSTACK_ROOT_MODE_GLOBAL:
        return True
    if os.environ.get("HELLOAGENTS_FULLSTACK_CONFIG_FILE", "").strip():
        return True
    if os.environ.get("HELLOAGENTS_FULLSTACK_CONFIG_ROOT", "").strip():
        return True
    if os.environ.get("HELLOAGENTS_FULLSTACK_RUNTIME_ROOT", "").strip():
        return True

    cfg = _read_global_config()
    mode = str(cfg.get("FULLSTACK_ROOT_MODE", "")).strip().lower()
    if mode == FULLSTACK_ROOT_MODE_GLOBAL:
        return True
    return bool(
        str(cfg.get("FULLSTACK_CONFIG_ROOT", "")).strip()
        or str(cfg.get("FULLSTACK_RUNTIME_ROOT", "")).strip()
    )


def _persist_root_choice(mode: str, root_path: str | None = None, create_dirs: bool = False) -> Path | None:
    """Persist root-mode choice and derived paths."""
    cfg = _read_global_config()
    if mode == FULLSTACK_ROOT_MODE_PROJECT:
        cfg["FULLSTACK_ROOT_MODE"] = FULLSTACK_ROOT_MODE_PROJECT
        for key in ("FULLSTACK_RUNTIME_ROOT", "FULLSTACK_CONFIG_ROOT", "FULLSTACK_INDEX_ROOT"):
            cfg.pop(key, None)
        _write_global_config(cfg)
        return None

    runtime_root = _normalize_path(root_path) if root_path else _select_default_global_root()
    cfg["FULLSTACK_ROOT_MODE"] = FULLSTACK_ROOT_MODE_GLOBAL
    cfg["FULLSTACK_RUNTIME_ROOT"] = str(runtime_root)
    cfg["FULLSTACK_CONFIG_ROOT"] = str(runtime_root / "config")
    cfg["FULLSTACK_INDEX_ROOT"] = str(runtime_root / "index")
    _write_global_config(cfg)
    if create_dirs:
        runtime_root.mkdir(parents=True, exist_ok=True)
        (runtime_root / "config").mkdir(parents=True, exist_ok=True)
        (runtime_root / "index").mkdir(parents=True, exist_ok=True)
    return runtime_root


def choose_root_mode(mode: str | None = None, root_path: str | None = None, create_dirs: bool = False) -> Path | None:
    """Persist a project/global fullstack-root choice, prompting if needed."""
    normalized_mode = (mode or "").strip().lower()
    if normalized_mode not in {FULLSTACK_ROOT_MODE_PROJECT, FULLSTACK_ROOT_MODE_GLOBAL}:
        if not sys.stdin.isatty():
            raise ValueError("Root mode must be provided in non-interactive environments")
        print("请选择全栈 fullstack 文件夹位置：", file=sys.stderr)
        print("  1. 项目内（当前项目/.helloagents/fullstack）", file=sys.stderr)
        print(f"  2. 用户目录（默认 {str(_select_default_global_root())}）", file=sys.stderr)
        while True:
            choice = input("请输入编号 (1/2): ").strip()
            if choice == "1":
                normalized_mode = FULLSTACK_ROOT_MODE_PROJECT
                break
            if choice == "2":
                normalized_mode = FULLSTACK_ROOT_MODE_GLOBAL
                custom = input("可选：输入自定义用户目录路径，直接回车使用默认值: ").strip()
                if custom:
                    root_path = custom
                break
            print("输入无效，请重新输入。", file=sys.stderr)

    return _persist_root_choice(normalized_mode, root_path=root_path, create_dirs=create_dirs)


def get_runtime_root(kb_root: str, project_root: str) -> Path:
    """Resolve runtime root directory."""
    runtime_root = _get_configured_runtime_root()
    if runtime_root is None:
        return _normalize_path(kb_root) / "fullstack" / "tasks"

    project_hash = _project_hash(_normalize_path(project_root))
    return runtime_root / project_hash / "fullstack" / "tasks"


def get_config_root() -> Path:
    """Resolve global fullstack config root directory."""
    env_root = os.environ.get("HELLOAGENTS_FULLSTACK_CONFIG_ROOT", "").strip()
    if env_root:
        return _normalize_path(env_root)

    cfg = _read_global_config()
    cfg_root = str(cfg.get("FULLSTACK_CONFIG_ROOT", "")).strip()
    if cfg_root:
        return _normalize_path(cfg_root)

    runtime_root = _get_configured_runtime_root()
    if runtime_root is not None:
        return runtime_root / "config"

    return DEFAULT_GLOBAL_FULLSTACK_ROOT / "config"


def get_index_root() -> Path:
    """Resolve global fullstack index root directory."""
    env_root = os.environ.get("HELLOAGENTS_FULLSTACK_INDEX_ROOT", "").strip()
    if env_root:
        return _normalize_path(env_root)
    cfg = _read_global_config()
    cfg_root = str(cfg.get("FULLSTACK_INDEX_ROOT", "")).strip()
    if cfg_root:
        return _normalize_path(cfg_root)

    runtime_root = _get_configured_runtime_root()
    if runtime_root is not None:
        return runtime_root / "index"

    return DEFAULT_GLOBAL_FULLSTACK_ROOT / "index"


def get_global_config_file() -> Path:
    """Return default global fullstack config file path."""
    return get_config_root() / "fullstack.yaml"


def get_legacy_config_file(kb_root: str) -> Path:
    """Return legacy project-local fullstack config path."""
    return _normalize_path(kb_root) / "fullstack" / "fullstack.yaml"


def resolve_fullstack_config_file(project_root: str, kb_root: str) -> Path:
    """Resolve fullstack config path with global-first, legacy fallback."""
    env_file = os.environ.get("HELLOAGENTS_FULLSTACK_CONFIG_FILE", "").strip()
    if env_file:
        return _normalize_path(env_file)

    if _get_configured_root_mode() == FULLSTACK_ROOT_MODE_PROJECT:
        return get_legacy_config_file(kb_root)

    global_cfg = get_global_config_file()
    if global_cfg.exists() or _has_explicit_global_fullstack_target():
        return global_cfg

    return get_legacy_config_file(kb_root)


def get_current_state_file(project_root: str, kb_root: str) -> Path:
    """Return current task-state file path."""
    return get_runtime_root(kb_root=kb_root, project_root=project_root) / "current.json"


def ensure_runtime_dirs(project_root: str, kb_root: str) -> Path:
    """Ensure runtime tasks directory exists and return it."""
    tasks_dir = get_runtime_root(kb_root=kb_root, project_root=project_root)
    tasks_dir.mkdir(parents=True, exist_ok=True)
    return tasks_dir


def ensure_config_dirs() -> Path:
    """Ensure global config dir exists and return it."""
    config_root = get_config_root()
    config_root.mkdir(parents=True, exist_ok=True)
    return config_root


def ensure_index_dirs() -> Path:
    """Ensure global index dir exists and return it."""
    index_root = get_index_root()
    index_root.mkdir(parents=True, exist_ok=True)
    return index_root


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: fullstack_runtime.py <command> [args...]", file=sys.stderr)
        print("Commands:", file=sys.stderr)
        print("  get-root                              - Print configured FULLSTACK_RUNTIME_ROOT", file=sys.stderr)
        print("  get-mode                              - Print configured FULLSTACK_ROOT_MODE", file=sys.stderr)
        print("  choose-root [project|global] [path]  - Choose where fullstack folder is initialized", file=sys.stderr)
        print("  set-root <path> [--create]           - Set fullstack global root in ~/.helloagents/helloagents.json", file=sys.stderr)
        print("  clear-root                           - Clear fullstack global root from global config", file=sys.stderr)
        print("  tasks-dir [project_root] [kb_root]   - Print runtime tasks dir", file=sys.stderr)
        print("  state-file [project_root] [kb_root]  - Print current state file path", file=sys.stderr)
        print("  ensure [project_root] [kb_root]      - Ensure runtime dirs", file=sys.stderr)
        print("  config-file [project_root] [kb_root] - Resolve fullstack config path (global-first)", file=sys.stderr)
        print("  global-config-file                   - Print global fullstack config path", file=sys.stderr)
        sys.exit(1)

    command = sys.argv[1]

    if command == "get-root":
        cfg = _read_global_config()
        print(str(cfg.get("FULLSTACK_RUNTIME_ROOT", "")))
        return

    if command == "get-mode":
        print(_get_configured_root_mode())
        return

    if command == "choose-root":
        mode = sys.argv[2] if len(sys.argv) > 2 else None
        root_path = None
        if mode == FULLSTACK_ROOT_MODE_GLOBAL and len(sys.argv) > 3 and not sys.argv[3].startswith("--"):
            root_path = sys.argv[3]
        chosen = choose_root_mode(mode=mode, root_path=root_path, create_dirs="--create" in sys.argv[2:])
        if chosen is None:
            print(FULLSTACK_ROOT_MODE_PROJECT)
        else:
            print(str(chosen))
        return

    if command == "set-root":
        if len(sys.argv) < 3:
            print("Usage: fullstack_runtime.py set-root <path> [--create]", file=sys.stderr)
            sys.exit(1)
        runtime_root = _normalize_path(sys.argv[2])
        _persist_root_choice(
            FULLSTACK_ROOT_MODE_GLOBAL,
            root_path=str(runtime_root),
            create_dirs="--create" in sys.argv[3:],
        )
        print(str(runtime_root))
        return

    if command == "clear-root":
        cfg = _read_global_config()
        changed = False
        for key in ("FULLSTACK_ROOT_MODE", "FULLSTACK_RUNTIME_ROOT", "FULLSTACK_CONFIG_ROOT", "FULLSTACK_INDEX_ROOT"):
            if key in cfg:
                del cfg[key]
                changed = True
        if changed:
            _write_global_config(cfg)
        print("")
        return

    project_root = sys.argv[2] if len(sys.argv) > 2 else str(Path.cwd())
    kb_root = sys.argv[3] if len(sys.argv) > 3 else str(Path.cwd() / ".helloagents")

    if command == "tasks-dir":
        print(get_runtime_root(kb_root=kb_root, project_root=project_root))
        return

    if command == "state-file":
        print(get_current_state_file(project_root=project_root, kb_root=kb_root))
        return

    if command == "ensure":
        print(ensure_runtime_dirs(project_root=project_root, kb_root=kb_root))
        return

    if command == "config-file":
        print(resolve_fullstack_config_file(project_root=project_root, kb_root=kb_root))
        return

    if command == "global-config-file":
        print(get_global_config_file())
        return

    print(f"Unknown command: {command}", file=sys.stderr)
    sys.exit(1)


if __name__ == "__main__":
    main()
