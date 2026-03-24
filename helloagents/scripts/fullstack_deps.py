#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
全栈模式依赖分析器。

职责:
- 解析 fullstack.yaml 的 service_dependencies
- 输出跨项目依赖分析（层级、上下游、循环依赖）
- 支持基于指定项目的影响范围分析
"""

import json
import sys
from pathlib import Path

from fullstack_config import (
    analyze_cross_project_dependencies,
    analyze_impact,
    load_config,
)


def main() -> None:
    """CLI 入口。"""
    if len(sys.argv) < 3:
        print(
            "Usage: fullstack_deps.py <config_path> <command> [project_paths...]",
            file=sys.stderr,
        )
        print("Commands:", file=sys.stderr)
        print("  cross [paths...]  - 跨项目依赖分析（不传 paths 则分析全图）", file=sys.stderr)
        print("  impact <paths...> - 变更影响分析（含下游级联）", file=sys.stderr)
        sys.exit(1)

    config_path = sys.argv[1]
    command = sys.argv[2]
    projects = sys.argv[3:]

    if not Path(config_path).exists():
        print(json.dumps({"error": f"Config file not found: {config_path}"}, ensure_ascii=False))
        sys.exit(1)

    config = load_config(config_path)
    if "error" in config:
        print(json.dumps(config, ensure_ascii=False))
        sys.exit(1)

    if command == "cross":
        result = analyze_cross_project_dependencies(config, projects or None)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return

    if command == "impact":
        if not projects:
            print("Usage: fullstack_deps.py <config_path> impact <project_paths...>", file=sys.stderr)
            sys.exit(1)
        result = analyze_impact(config, projects)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return

    print(f"Unknown command: {command}", file=sys.stderr)
    sys.exit(1)


if __name__ == "__main__":
    main()

