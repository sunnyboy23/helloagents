"""CLI bridge for fullstack runtime, config, and migration management.

This module adds terminal-level fallback commands:
  helloagents fullstack runtime set-root <path> [--create]
  helloagents fullstack runtime get-root
  helloagents fullstack runtime clear-root
  helloagents fullstack migrate --dry-run [project_root] [kb_root]
  helloagents fullstack migrate --to-global [project_root] [kb_root]
  helloagents fullstack migrate --rollback [project_root]
"""

from __future__ import annotations

import json
from pathlib import Path

from .._common import _msg
from ..scripts.fullstack_config import (
    bind_project,
    build_default_fullstack_config,
    ensure_project_kb,
    get_all_projects,
    list_engineers,
    load_config,
    normalize_project_path,
    save_config,
    validate_config,
)
from ..scripts.fullstack_runtime import (
    FULLSTACK_ROOT_MODE_GLOBAL,
    FULLSTACK_ROOT_MODE_PROJECT,
    ensure_config_dirs,
    _normalize_path,
    _read_global_config,
    _write_global_config,
    choose_root_mode,
    resolve_fullstack_config_file,
)
from ..scripts.fullstack_migrate import dry_run, rollback, to_global


def _print_usage() -> None:
    print(_msg(
        "用法: helloagents fullstack <runtime|migrate> ...",
        "Usage: helloagents fullstack <runtime|migrate> ...",
    ))
    print(_msg(
        "示例: helloagents fullstack runtime set-root '~/.helloagents/runtime' --create",
        "Example: helloagents fullstack runtime set-root '~/.helloagents/runtime' --create",
    ))
    print(_msg(
        "示例: helloagents fullstack runtime choose-root",
        "Example: helloagents fullstack runtime choose-root",
    ))
    print(_msg(
        "示例: helloagents fullstack migrate --dry-run '/path/project' '/path/project/.helloagents'",
        "Example: helloagents fullstack migrate --dry-run '/path/project' '/path/project/.helloagents'",
    ))


def handle_fullstack_runtime_cli(args: list[str]) -> bool:
    """Handle `helloagents fullstack runtime ...` command family."""
    if not args or args[0] in {"-h", "--help", "help"}:
        _print_usage()
        return True

    group = args[0]
    project_root = str(Path.cwd())
    kb_root = str(Path.cwd() / ".helloagents")

    if group == "runtime":
        if len(args) < 2:
            _print_usage()
            return False

        sub = args[1]

        if sub == "get-root":
            cfg = _read_global_config()
            print(str(cfg.get("FULLSTACK_RUNTIME_ROOT", "")))
            return True

        if sub == "get-mode":
            cfg = _read_global_config()
            print(str(cfg.get("FULLSTACK_ROOT_MODE", "")))
            return True

        if sub == "choose-root":
            mode = args[2] if len(args) > 2 else None
            root_path = None
            if mode == FULLSTACK_ROOT_MODE_GLOBAL and len(args) > 3 and not args[3].startswith("--"):
                root_path = args[3]
            chosen = choose_root_mode(
                mode=mode,
                root_path=root_path,
                create_dirs="--create" in args[2:],
            )
            if chosen is None:
                print(FULLSTACK_ROOT_MODE_PROJECT)
            else:
                print(str(chosen))
            return True

        if sub == "clear-root":
            cfg = _read_global_config()
            changed = False
            for key in ("FULLSTACK_ROOT_MODE", "FULLSTACK_RUNTIME_ROOT", "FULLSTACK_CONFIG_ROOT", "FULLSTACK_INDEX_ROOT"):
                if key in cfg:
                    del cfg[key]
                    changed = True
            if changed:
                _write_global_config(cfg)
            print("")
            return True

        if sub == "set-root":
            if len(args) < 3:
                _print_usage()
                return False
            runtime_root = _normalize_path(args[2])
            choose_root_mode(
                mode=FULLSTACK_ROOT_MODE_GLOBAL,
                root_path=str(runtime_root),
                create_dirs="--create" in args[3:],
            )
            print(str(runtime_root))
            return True

        print(_msg(f"未知 runtime 子命令: {sub}", f"Unknown runtime subcommand: {sub}"))
        _print_usage()
        return False

    if group == "init":
        config_path = resolve_fullstack_config_file(project_root=project_root, kb_root=kb_root)
        if config_path.exists() and "--force" not in args[1:]:
            print(json.dumps({
                "success": True,
                "created": False,
                "config_path": str(config_path),
                "message": "Fullstack config already exists",
            }, ensure_ascii=False, indent=2))
            return True

        if str(config_path).startswith(str(Path.home() / ".helloagents")):
            ensure_config_dirs()
        else:
            config_path.parent.mkdir(parents=True, exist_ok=True)

        config = build_default_fullstack_config()
        ok, err = save_config(str(config_path), config)
        if not ok:
            print(json.dumps({
                "success": False,
                "error": f"Failed to save config: {err}",
                "config_path": str(config_path),
            }, ensure_ascii=False, indent=2))
            return False

        print(json.dumps({
            "success": True,
            "created": True,
            "config_path": str(config_path),
            "root_mode": _read_global_config().get("FULLSTACK_ROOT_MODE", ""),
            "engineers": [item["id"] for item in config["engineers"]],
        }, ensure_ascii=False, indent=2))
        return True

    if group in {"projects", "engineers", "bind", "unbind", "kb"}:
        config_path = resolve_fullstack_config_file(project_root=project_root, kb_root=kb_root)
        config = load_config(str(config_path))
        if "error" in config:
            print(json.dumps({
                "success": False,
                "error": config["error"],
                "config_path": str(config_path),
                "suggestion": "Run `helloagents fullstack init` first.",
            }, ensure_ascii=False, indent=2))
            return False

        if group == "projects":
            print(json.dumps(get_all_projects(config), ensure_ascii=False, indent=2))
            return True

        if group == "engineers":
            print(json.dumps(list_engineers(config), ensure_ascii=False, indent=2))
            return True

        if group == "bind":
            if len(args) < 4 or args[2] != "--engineer-id":
                print(_msg(
                    "用法: helloagents fullstack bind <project_path> --engineer-id <id> [--description txt] [--tech a,b] [--auto-init-kb true|false] [--allow-rebind]",
                    "Usage: helloagents fullstack bind <project_path> --engineer-id <id> [--description txt] [--tech a,b] [--auto-init-kb true|false] [--allow-rebind]",
                ))
                return False
            project_path = args[1]
            engineer_id = args[3]
            description = None
            tech_stack: list[str] = []
            auto_init_kb = True
            allow_rebind = "--allow-rebind" in args[4:]

            if "--description" in args[4:]:
                idx = args.index("--description")
                if idx + 1 < len(args):
                    description = args[idx + 1]

            if "--tech" in args[4:]:
                idx = args.index("--tech")
                if idx + 1 < len(args):
                    tech_stack = [item.strip() for item in args[idx + 1].split(",") if item.strip()]

            if "--auto-init-kb" in args[4:]:
                idx = args.index("--auto-init-kb")
                if idx + 1 < len(args):
                    auto_init_kb = args[idx + 1].strip().lower() in {"true", "1", "yes", "y"}

            result = bind_project(
                config=config,
                project_path=project_path,
                engineer_id=engineer_id,
                description=description,
                tech_stack=tech_stack,
                auto_init_kb=auto_init_kb,
                allow_rebind=allow_rebind,
            )
            if result.get("success"):
                is_valid, errors = validate_config(config)
                if not is_valid:
                    print(json.dumps({
                        "success": False,
                        "error": "Config becomes invalid after bind",
                        "validation_errors": errors,
                    }, ensure_ascii=False, indent=2))
                    return False
                ok, err = save_config(str(config_path), config)
                if not ok:
                    print(json.dumps({
                        "success": False,
                        "error": f"Failed to save config: {err}",
                    }, ensure_ascii=False, indent=2))
                    return False
            print(json.dumps(result, ensure_ascii=False, indent=2))
            return bool(result.get("success", False))

        if group == "unbind":
            if len(args) < 2:
                print(_msg(
                    "用法: helloagents fullstack unbind <project_path>",
                    "Usage: helloagents fullstack unbind <project_path>",
                ))
                return False
            project_path = normalize_project_path(args[1])
            for engineer in config.get("engineers", []):
                engineer["projects"] = [
                    item for item in engineer.get("projects", [])
                    if normalize_project_path(item.get("path", "")) != project_path
                ]
            ok, err = save_config(str(config_path), config)
            if not ok:
                print(json.dumps({"success": False, "error": f"Failed to save config: {err}"}, ensure_ascii=False, indent=2))
                return False
            print(json.dumps({"success": True, "project_path": project_path}, ensure_ascii=False, indent=2))
            return True

        if group == "kb":
            if len(args) < 3 or args[1] != "init" or args[2] != "--all":
                print(_msg(
                    "用法: helloagents fullstack kb init --all [--force]",
                    "Usage: helloagents fullstack kb init --all [--force]",
                ))
                return False
            force = "--force" in args[3:]
            projects = get_all_projects(config)
            results = []
            for item in projects:
                project_path = item.get("path")
                if not project_path:
                    continue
                results.append(ensure_project_kb(config, project_path, force))
            summary = {
                "success": all(row.get("success", False) for row in results),
                "total": len(results),
                "completed": sum(1 for row in results if row.get("success", False)),
                "results": results,
            }
            print(json.dumps(summary, ensure_ascii=False, indent=2))
            return bool(summary["success"])

    if group == "migrate":
        if len(args) < 2:
            _print_usage()
            return False
        action = args[1]
        project_root = args[2] if len(args) > 2 else str(Path.cwd())
        kb_root = args[3] if len(args) > 3 else str(Path(project_root) / ".helloagents")

        if action == "--dry-run":
            result = dry_run(project_root=project_root, kb_root=kb_root)
        elif action == "--to-global":
            result = to_global(project_root=project_root, kb_root=kb_root)
        elif action == "--rollback":
            result = rollback(project_root=project_root)
        else:
            print(_msg(f"未知 migrate 子命令: {action}", f"Unknown migrate subcommand: {action}"))
            _print_usage()
            return False

        print(json.dumps(result, ensure_ascii=False, indent=2))
        return bool(result.get("success", False))

    print(_msg(
        f"未知 fullstack 子命令组: {group}",
        f"Unknown fullstack command group: {group}",
    ))
    _print_usage()
    return False
