#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Fullstack storage migration helper.

Migrate fullstack non-project-coupled data from legacy project path to global path:
- config: {KB_ROOT}/fullstack/fullstack.yaml -> ~/.helloagents/fullstack/config/fullstack.yaml
- runtime: {KB_ROOT}/fullstack/tasks/*       -> {FULLSTACK_RUNTIME_ROOT}/{project_hash}/fullstack/tasks/*

Commands:
  dry-run
  to-global
  rollback
"""

from __future__ import annotations

import json
import shutil
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List

try:  # package import path
    from .fullstack_runtime import (
        ensure_index_dirs,
        ensure_runtime_dirs,
        get_legacy_config_file,
        get_runtime_root,
        get_global_config_file,
    )
except Exception:  # script direct-run fallback
    from fullstack_runtime import (  # type: ignore
        ensure_index_dirs,
        ensure_runtime_dirs,
        get_legacy_config_file,
        get_runtime_root,
        get_global_config_file,
    )


def _now() -> str:
    return datetime.now().strftime("%Y-%m-%dT%H:%M:%S")


def _copy_file(src: Path, dst: Path) -> Dict[str, Any]:
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)
    return {"src": str(src), "dst": str(dst), "type": "file"}


def _copy_tree_files(src_dir: Path, dst_dir: Path) -> List[Dict[str, Any]]:
    copied: List[Dict[str, Any]] = []
    if not src_dir.exists():
        return copied
    for path in src_dir.rglob("*"):
        if not path.is_file():
            continue
        rel = path.relative_to(src_dir)
        target = dst_dir / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, target)
        copied.append({"src": str(path), "dst": str(target), "type": "file"})
    return copied


def _load_map(map_file: Path) -> Dict[str, Any]:
    if not map_file.exists():
        return {"entries": []}
    try:
        return json.loads(map_file.read_text(encoding="utf-8"))
    except Exception:
        return {"entries": []}


def _save_map(map_file: Path, payload: Dict[str, Any]) -> None:
    map_file.parent.mkdir(parents=True, exist_ok=True)
    map_file.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _build_plan(project_root: Path, kb_root: Path) -> Dict[str, Any]:
    legacy_cfg = get_legacy_config_file(str(kb_root))
    global_cfg = get_global_config_file()
    legacy_tasks = kb_root / "fullstack" / "tasks"
    global_tasks = get_runtime_root(kb_root=str(kb_root), project_root=str(project_root))

    actions: List[Dict[str, Any]] = []
    if legacy_cfg.exists():
        actions.append(
            {
                "kind": "config",
                "src": str(legacy_cfg),
                "dst": str(global_cfg),
                "exists_dst": global_cfg.exists(),
            }
        )
    if legacy_tasks.exists():
        files = [str(p) for p in legacy_tasks.rglob("*") if p.is_file()]
        if files:
            actions.append(
                {
                    "kind": "runtime",
                    "src": str(legacy_tasks),
                    "dst": str(global_tasks),
                    "file_count": len(files),
                }
            )

    return {
        "project_root": str(project_root),
        "kb_root": str(kb_root),
        "legacy_config": str(legacy_cfg),
        "global_config": str(global_cfg),
        "legacy_tasks": str(legacy_tasks),
        "global_tasks": str(global_tasks),
        "actions": actions,
        "can_migrate": len(actions) > 0,
    }


def dry_run(project_root: str, kb_root: str) -> Dict[str, Any]:
    return {"success": True, "mode": "dry-run", "plan": _build_plan(Path(project_root), Path(kb_root))}


def to_global(project_root: str, kb_root: str) -> Dict[str, Any]:
    project = Path(project_root).expanduser().resolve()
    kb = Path(kb_root).expanduser().resolve()
    plan = _build_plan(project, kb)
    if not plan["can_migrate"]:
        return {"success": True, "mode": "to-global", "message": "Nothing to migrate", "plan": plan, "changes": []}

    changes: List[Dict[str, Any]] = []
    conflicts: List[Dict[str, Any]] = []

    legacy_cfg = Path(plan["legacy_config"])
    global_cfg = Path(plan["global_config"])
    if legacy_cfg.exists():
        if global_cfg.exists() and global_cfg.read_text(encoding="utf-8") != legacy_cfg.read_text(encoding="utf-8"):
            conflict_path = global_cfg.with_suffix(global_cfg.suffix + f".conflict-{datetime.now().strftime('%Y%m%d%H%M%S')}")
            changes.append(_copy_file(legacy_cfg, conflict_path))
            conflicts.append({"src": str(legacy_cfg), "dst": str(global_cfg), "conflict_copy": str(conflict_path)})
        else:
            changes.append(_copy_file(legacy_cfg, global_cfg))

    legacy_tasks = Path(plan["legacy_tasks"])
    global_tasks = Path(plan["global_tasks"])
    if legacy_tasks.exists():
        ensure_runtime_dirs(project_root=str(project), kb_root=str(kb))
        changes.extend(_copy_tree_files(legacy_tasks, global_tasks))

    index_root = ensure_index_dirs()
    map_file = index_root / "migration-map.json"
    payload = _load_map(map_file)
    entry = {
        "id": f"{project.name}-{datetime.now().strftime('%Y%m%d%H%M%S')}",
        "timestamp": _now(),
        "project_root": str(project),
        "kb_root": str(kb),
        "legacy_config": str(legacy_cfg),
        "global_config": str(global_cfg),
        "legacy_tasks": str(legacy_tasks),
        "global_tasks": str(global_tasks),
        "changes": changes,
        "conflicts": conflicts,
    }
    payload.setdefault("entries", []).append(entry)
    _save_map(map_file, payload)

    return {
        "success": True,
        "mode": "to-global",
        "plan": plan,
        "changes": changes,
        "conflicts": conflicts,
        "map_file": str(map_file),
        "entry_id": entry["id"],
    }


def rollback(project_root: str) -> Dict[str, Any]:
    project = Path(project_root).expanduser().resolve()
    index_root = ensure_index_dirs()
    map_file = index_root / "migration-map.json"
    payload = _load_map(map_file)
    entries = payload.get("entries", [])
    target = None
    for item in reversed(entries):
        if item.get("project_root") == str(project):
            target = item
            break
    if target is None:
        return {"success": False, "mode": "rollback", "error": "No migration record for this project"}

    changes: List[Dict[str, Any]] = []
    global_cfg = Path(target["global_config"])
    legacy_cfg = Path(target["legacy_config"])
    if global_cfg.exists():
        changes.append(_copy_file(global_cfg, legacy_cfg))

    global_tasks = Path(target["global_tasks"])
    legacy_tasks = Path(target["legacy_tasks"])
    if global_tasks.exists():
        changes.extend(_copy_tree_files(global_tasks, legacy_tasks))

    return {
        "success": True,
        "mode": "rollback",
        "project_root": str(project),
        "restored_from_entry": target.get("id"),
        "changes": changes,
    }


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: fullstack_migrate.py <dry-run|to-global|rollback> [project_root] [kb_root]", file=sys.stderr)
        sys.exit(1)

    mode = sys.argv[1]
    project_root = sys.argv[2] if len(sys.argv) > 2 else str(Path.cwd())
    kb_root = sys.argv[3] if len(sys.argv) > 3 else str(Path.cwd() / ".helloagents")

    if mode == "dry-run":
        result = dry_run(project_root, kb_root)
    elif mode == "to-global":
        result = to_global(project_root, kb_root)
    elif mode == "rollback":
        result = rollback(project_root)
    else:
        print(f"Unknown mode: {mode}", file=sys.stderr)
        sys.exit(1)

    print(json.dumps(result, ensure_ascii=False, indent=2))
    if not result.get("success", False):
        sys.exit(1)


if __name__ == "__main__":
    main()
