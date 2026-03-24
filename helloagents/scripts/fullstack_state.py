#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
全栈模式任务状态存储脚本。

该脚本基于 TaskManager 提供状态读写、状态转换验证和进度统计接口，
用于兼容任务清单中的 fullstack_state.py 入口定义。
"""

import json
import sys

from fullstack_task_manager import TaskManager


def main() -> None:
    """CLI 入口。"""
    if len(sys.argv) < 3:
        print("Usage: fullstack_state.py <state_file> <command> [args...]", file=sys.stderr)
        print("Commands:", file=sys.stderr)
        print("  get                            - 读取完整状态", file=sys.stderr)
        print("  summary                        - 读取状态摘要", file=sys.stderr)
        print("  report                         - 读取进度报告", file=sys.stderr)
        print("  update <task_id> <status> <result_json> - 更新任务状态", file=sys.stderr)
        sys.exit(1)

    state_file = sys.argv[1]
    command = sys.argv[2]
    manager = TaskManager(state_file)

    if command == "get":
        print(json.dumps(manager.state, ensure_ascii=False, indent=2))
        return

    if command == "summary":
        print(json.dumps(manager.get_status_summary(), ensure_ascii=False, indent=2))
        return

    if command == "report":
        print(json.dumps(manager.get_progress_report(), ensure_ascii=False, indent=2))
        return

    if command == "update":
        if len(sys.argv) < 6:
            print("Usage: fullstack_state.py <state_file> update <task_id> <status> <result_json>", file=sys.stderr)
            sys.exit(1)
        task_id = sys.argv[3]
        status = sys.argv[4]
        with open(sys.argv[5], encoding="utf-8") as f:
            result = json.load(f)
        updated = manager.process_feedback(task_id, status, result)
        print(json.dumps(updated, ensure_ascii=False, indent=2))
        if not updated.get("success"):
            sys.exit(1)
        return

    print(f"Unknown command: {command}", file=sys.stderr)
    sys.exit(1)


if __name__ == "__main__":
    main()

