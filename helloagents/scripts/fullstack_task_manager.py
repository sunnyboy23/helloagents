#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
全栈模式任务状态管理器

管理任务组的状态、进度追踪、DAG 执行调度。
"""

import json
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


class TaskManager:
    """任务状态管理器"""

    def __init__(self, state_file: str):
        """
        初始化任务管理器

        Args:
            state_file: 状态文件路径（JSON）
        """
        self.state_file = Path(state_file)
        self.state: Dict[str, Any] = {}
        self._load_state()

    def _load_state(self):
        """加载状态文件"""
        if self.state_file.exists():
            try:
                with open(self.state_file, encoding="utf-8") as f:
                    self.state = json.load(f)
            except (json.JSONDecodeError, IOError):
                self.state = {}
        else:
            self.state = {}

    def _save_state(self):
        """保存状态文件"""
        self.state["updated_at"] = datetime.now().isoformat()
        self.state_file.parent.mkdir(parents=True, exist_ok=True)
        with open(self.state_file, "w", encoding="utf-8") as f:
            json.dump(self.state, f, ensure_ascii=False, indent=2)

    def create_task_group(
        self,
        task_group_id: str,
        requirement: str,
        tasks: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        创建任务组

        Args:
            task_group_id: 任务组 ID
            requirement: 需求描述
            tasks: 任务列表

        Returns:
            创建结果
        """
        # 构建任务字典
        tasks_dict = {}
        for task in tasks:
            task_id = task.get("task_id")
            if task_id:
                tasks_dict[task_id] = {
                    **task,
                    "status": "pending",
                    "retry_count": 0
                }

        # 计算执行层级
        execution_layers = self._compute_execution_layers(tasks_dict)

        self.state = {
            "task_group_id": task_group_id,
            "requirement": requirement,
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
            "status": "pending",
            "progress": {
                "total": len(tasks),
                "completed": 0,
                "failed": 0,
                "in_progress": 0,
                "pending": len(tasks)
            },
            "execution_layers": execution_layers,
            "tasks": tasks_dict,
            "tech_docs_synced": []
        }

        self._save_state()

        return {
            "success": True,
            "task_group_id": task_group_id,
            "total_tasks": len(tasks),
            "layers": len(execution_layers)
        }

    def _compute_execution_layers(self, tasks: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        计算 DAG 执行层级（拓扑排序）

        Args:
            tasks: 任务字典

        Returns:
            层级列表
        """
        # 计算入度
        in_degree = {task_id: 0 for task_id in tasks}

        for task_id, task in tasks.items():
            deps = task.get("depends_on", [])
            for dep in deps:
                if dep in in_degree:
                    in_degree[task_id] += 1

        # 分层
        layers = []
        remaining = set(tasks.keys())
        layer_num = 1

        while remaining:
            # 找出入度为 0 的任务
            layer_tasks = [t for t in remaining if in_degree[t] == 0]

            if not layer_tasks:
                # 有循环依赖，将剩余任务放入最后一层
                layers.append({
                    "layer": layer_num,
                    "task_ids": list(remaining),
                    "status": "pending",
                    "note": "circular_dependency_detected"
                })
                break

            layers.append({
                "layer": layer_num,
                "task_ids": layer_tasks,
                "status": "pending"
            })

            remaining -= set(layer_tasks)

            # 更新入度
            for task_id in remaining:
                deps = tasks[task_id].get("depends_on", [])
                for dep in deps:
                    if dep in layer_tasks:
                        in_degree[task_id] -= 1

            layer_num += 1

        return layers

    def get_next_layer(self) -> Optional[Dict[str, Any]]:
        """
        获取下一个待执行的层级

        Returns:
            层级信息，或 None（无待执行层级）
        """
        for layer in self.state.get("execution_layers", []):
            if layer.get("status") == "pending":
                return layer
        return None

    def get_layer_tasks(self, layer_num: int) -> List[Dict[str, Any]]:
        """
        获取指定层级的所有任务

        Args:
            layer_num: 层级编号

        Returns:
            任务列表
        """
        for layer in self.state.get("execution_layers", []):
            if layer.get("layer") == layer_num:
                task_ids = layer.get("task_ids", [])
                return [
                    self.state["tasks"][tid]
                    for tid in task_ids
                    if tid in self.state.get("tasks", {})
                ]
        return []

    def start_task(self, task_id: str) -> bool:
        """
        标记任务开始执行

        Args:
            task_id: 任务 ID

        Returns:
            是否成功
        """
        if task_id not in self.state.get("tasks", {}):
            return False

        task = self.state["tasks"][task_id]

        # 检查依赖是否完成
        for dep in task.get("depends_on", []):
            dep_task = self.state["tasks"].get(dep)
            if dep_task and dep_task.get("status") not in ["completed", "skipped"]:
                task["status"] = "blocked"
                self._save_state()
                return False

        task["status"] = "in_progress"
        task["started_at"] = datetime.now().isoformat()

        self._update_progress()
        self._save_state()
        return True

    def complete_task(
        self,
        task_id: str,
        result: Dict[str, Any],
        status: str = "completed"
    ) -> bool:
        """
        标记任务完成

        Args:
            task_id: 任务 ID
            result: 执行结果
            status: 状态（completed/partial/failed）

        Returns:
            是否成功
        """
        if task_id not in self.state.get("tasks", {}):
            return False

        task = self.state["tasks"][task_id]
        task["status"] = status
        task["completed_at"] = datetime.now().isoformat()
        task["result"] = result

        # 如果失败，记录错误
        if status == "failed":
            task["error"] = result.get("error", "Unknown error")
            self._mark_downstream_blocked(task_id)

        # 更新层级状态
        self._update_layer_status(task_id)

        self._update_progress()
        self._save_state()
        return True

    def _mark_downstream_blocked(self, failed_task_id: str):
        """
        标记依赖失败任务的下游任务为 blocked（递归）。

        Args:
            failed_task_id: 失败的任务 ID
        """
        tasks = self.state.get("tasks", {})
        queue = [failed_task_id]
        visited = set()

        while queue:
            current = queue.pop(0)
            if current in visited:
                continue
            visited.add(current)

            for task_id, task in tasks.items():
                if current in task.get("depends_on", []):
                    if task.get("status") in {"pending", "in_progress"}:
                        task["status"] = "blocked"
                    queue.append(task_id)

    def _is_task_ready(self, task_id: str) -> bool:
        """
        判断任务是否满足执行条件。

        Args:
            task_id: 任务 ID

        Returns:
            所有依赖均已完成时返回 True
        """
        task = self.state.get("tasks", {}).get(task_id)
        if not task:
            return False

        for dep in task.get("depends_on", []):
            dep_task = self.state.get("tasks", {}).get(dep, {})
            if dep_task.get("status") not in {"completed", "skipped"}:
                return False
        return True

    def get_triggered_tasks(self, completed_task_id: str) -> List[Dict[str, Any]]:
        """
        获取由某任务完成触发的可执行下游任务。

        Args:
            completed_task_id: 已完成任务 ID

        Returns:
            触发任务列表
        """
        triggered = []
        tasks = self.state.get("tasks", {})

        for task_id, task in tasks.items():
            if task.get("status") != "pending":
                continue
            deps = task.get("depends_on", [])
            if completed_task_id not in deps:
                continue
            if self._is_task_ready(task_id):
                triggered.append(
                    {
                        "task_id": task_id,
                        "engineer_id": task.get("engineer_id"),
                        "project": task.get("project"),
                        "description": task.get("description"),
                    }
                )

        return triggered

    def process_feedback(
        self,
        task_id: str,
        status: str,
        result: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        处理工程师反馈（2.5）:
        更新任务状态 -> 触发下游任务 -> 生成进度报告。

        Args:
            task_id: 任务 ID
            status: 反馈状态（completed/partial/failed）
            result: 反馈结果数据

        Returns:
            处理结果
        """
        if status not in {"completed", "partial", "failed"}:
            return {"success": False, "error": f"Invalid status: {status}"}

        if task_id not in self.state.get("tasks", {}):
            return {"success": False, "error": f"Task not found: {task_id}"}

        success = self.complete_task(task_id, result, status=status)
        if not success:
            return {"success": False, "error": "Failed to update task state"}

        triggered_tasks = self.get_triggered_tasks(task_id) if status == "completed" else []
        summary = self.get_status_summary()

        return {
            "success": True,
            "task_id": task_id,
            "status": status,
            "triggered_tasks": triggered_tasks,
            "progress": summary.get("progress", {}),
            "overall_status": summary.get("status"),
            "current_layer": summary.get("current_layer"),
        }

    def fail_task(self, task_id: str, error: str) -> bool:
        """
        标记任务失败

        Args:
            task_id: 任务 ID
            error: 错误信息

        Returns:
            是否成功
        """
        return self.complete_task(task_id, {"error": error}, "failed")

    def retry_task(self, task_id: str) -> bool:
        """
        重试任务

        Args:
            task_id: 任务 ID

        Returns:
            是否可重试
        """
        if task_id not in self.state.get("tasks", {}):
            return False

        task = self.state["tasks"][task_id]

        if task.get("retry_count", 0) >= 3:
            return False

        task["status"] = "pending"
        task["retry_count"] = task.get("retry_count", 0) + 1
        task.pop("error", None)
        task.pop("completed_at", None)

        self._update_progress()
        self._save_state()
        return True

    def _update_layer_status(self, task_id: str):
        """更新包含指定任务的层级状态"""
        for layer in self.state.get("execution_layers", []):
            if task_id in layer.get("task_ids", []):
                # 检查该层所有任务状态
                all_completed = True
                any_failed = False
                any_in_progress = False

                for tid in layer["task_ids"]:
                    task = self.state["tasks"].get(tid, {})
                    status = task.get("status", "pending")

                    if status == "in_progress":
                        any_in_progress = True
                        all_completed = False
                    elif status == "failed":
                        any_failed = True
                        all_completed = False
                    elif status not in ["completed", "skipped"]:
                        all_completed = False

                if all_completed:
                    layer["status"] = "completed"
                elif any_failed and not any_in_progress:
                    layer["status"] = "partial"
                elif any_in_progress:
                    layer["status"] = "in_progress"

                break

    def _update_progress(self):
        """更新进度统计"""
        tasks = self.state.get("tasks", {})
        progress = {
            "total": len(tasks),
            "completed": 0,
            "failed": 0,
            "in_progress": 0,
            "pending": 0
        }

        for task in tasks.values():
            status = task.get("status", "pending")
            if status == "completed":
                progress["completed"] += 1
            elif status == "failed":
                progress["failed"] += 1
            elif status == "in_progress":
                progress["in_progress"] += 1
            else:
                progress["pending"] += 1

        self.state["progress"] = progress

        # 更新整体状态
        if progress["completed"] == progress["total"]:
            self.state["status"] = "completed"
        elif progress["failed"] > 0 and progress["in_progress"] == 0 and progress["pending"] == 0:
            self.state["status"] = "partial" if progress["completed"] > 0 else "failed"
        elif progress["in_progress"] > 0:
            self.state["status"] = "in_progress"

    def record_tech_doc_sync(
        self,
        source: str,
        targets: List[str]
    ):
        """
        记录技术文档同步

        Args:
            source: 源文件路径
            targets: 目标项目列表
        """
        if "tech_docs_synced" not in self.state:
            self.state["tech_docs_synced"] = []

        self.state["tech_docs_synced"].append({
            "source": source,
            "targets": targets,
            "synced_at": datetime.now().isoformat()
        })

        self._save_state()

    def get_status_summary(self) -> Dict[str, Any]:
        """
        获取状态摘要

        Returns:
            状态摘要
        """
        return {
            "task_group_id": self.state.get("task_group_id"),
            "status": self.state.get("status"),
            "progress": self.state.get("progress"),
            "current_layer": self._get_current_layer_info(),
            "tech_docs_synced": len(self.state.get("tech_docs_synced", []))
        }

    def get_progress_report(self) -> Dict[str, Any]:
        """
        生成进度报告（2.5）。

        Returns:
            进度报告字典
        """
        tasks = self.state.get("tasks", {})
        by_status: Dict[str, List[Dict[str, Any]]] = {
            "pending": [],
            "in_progress": [],
            "completed": [],
            "partial": [],
            "failed": [],
            "blocked": [],
            "skipped": [],
        }

        for task_id, task in tasks.items():
            status = task.get("status", "pending")
            by_status.setdefault(status, []).append(
                {
                    "task_id": task_id,
                    "engineer_id": task.get("engineer_id"),
                    "project": task.get("project"),
                    "description": task.get("description"),
                }
            )

        return {
            "task_group_id": self.state.get("task_group_id"),
            "overall_status": self.state.get("status"),
            "progress": self.state.get("progress", {}),
            "current_layer": self._get_current_layer_info(),
            "tasks_by_status": by_status,
        }

    def _get_current_layer_info(self) -> Optional[Dict[str, Any]]:
        """获取当前执行层级信息"""
        for layer in self.state.get("execution_layers", []):
            if layer.get("status") in ["pending", "in_progress"]:
                return {
                    "layer": layer.get("layer"),
                    "status": layer.get("status"),
                    "tasks": len(layer.get("task_ids", []))
                }
        return None


def resolve_state_file_arg(state_file_arg: str) -> str:
    """Resolve state file path.

    - Normal path: return as-is
    - @auto: resolve via fullstack_runtime.py using cwd-derived project/kb roots
    """
    if state_file_arg != "@auto":
        return state_file_arg

    project_root = os.environ.get("HELLOAGENTS_PROJECT_ROOT", str(Path.cwd()))
    kb_root = os.environ.get("HELLOAGENTS_KB_ROOT", str(Path.cwd() / ".helloagents"))

    try:
        from fullstack_runtime import get_current_state_file, ensure_runtime_dirs

        ensure_runtime_dirs(project_root=project_root, kb_root=kb_root)
        return str(get_current_state_file(project_root=project_root, kb_root=kb_root))
    except Exception:
        fallback = Path(kb_root) / "fullstack" / "tasks"
        fallback.mkdir(parents=True, exist_ok=True)
        return str(fallback / "current.json")


def main():
    """CLI 入口"""
    if len(sys.argv) < 3:
        print("Usage: fullstack_task_manager.py <state_file|@auto> <command> [args...]", file=sys.stderr)
        print("Commands:", file=sys.stderr)
        print("  create <tasks_json>     - Create task group from JSON file", file=sys.stderr)
        print("  status                  - Get status summary", file=sys.stderr)
        print("  next-layer              - Get next executable layer", file=sys.stderr)
        print("  start <task_id>         - Mark task as started", file=sys.stderr)
        print("  complete <task_id> <result_json>  - Mark task as completed", file=sys.stderr)
        print("  fail <task_id> <error>  - Mark task as failed", file=sys.stderr)
        print("  retry <task_id>         - Retry failed task", file=sys.stderr)
        print("  feedback <task_id> <status> <result_json> - Process engineer feedback", file=sys.stderr)
        print("  report                  - Get progress report", file=sys.stderr)
        sys.exit(1)

    state_file = resolve_state_file_arg(sys.argv[1])
    command = sys.argv[2]

    manager = TaskManager(state_file)

    if command == "create":
        if len(sys.argv) < 4:
            print("Usage: ... create <tasks_json>", file=sys.stderr)
            sys.exit(1)

        with open(sys.argv[3], encoding="utf-8") as f:
            data = json.load(f)

        result = manager.create_task_group(
            data.get("task_group_id", f"{datetime.now().strftime('%Y%m%d')}-unnamed"),
            data.get("requirement", ""),
            data.get("tasks", [])
        )
        print(json.dumps(result, ensure_ascii=False, indent=2))

    elif command == "status":
        result = manager.get_status_summary()
        print(json.dumps(result, ensure_ascii=False, indent=2))

    elif command == "next-layer":
        layer = manager.get_next_layer()
        if layer:
            tasks = manager.get_layer_tasks(layer["layer"])
            print(json.dumps({
                "layer": layer,
                "tasks": tasks
            }, ensure_ascii=False, indent=2))
        else:
            print(json.dumps({"message": "No pending layers"}, ensure_ascii=False))

    elif command == "start":
        if len(sys.argv) < 4:
            print("Usage: ... start <task_id>", file=sys.stderr)
            sys.exit(1)
        success = manager.start_task(sys.argv[3])
        print(json.dumps({"success": success}))

    elif command == "complete":
        if len(sys.argv) < 5:
            print("Usage: ... complete <task_id> <result_json>", file=sys.stderr)
            sys.exit(1)
        with open(sys.argv[4], encoding="utf-8") as f:
            result = json.load(f)
        success = manager.complete_task(sys.argv[3], result)
        print(json.dumps({"success": success}))

    elif command == "fail":
        if len(sys.argv) < 5:
            print("Usage: ... fail <task_id> <error>", file=sys.stderr)
            sys.exit(1)
        success = manager.fail_task(sys.argv[3], sys.argv[4])
        print(json.dumps({"success": success}))

    elif command == "retry":
        if len(sys.argv) < 4:
            print("Usage: ... retry <task_id>", file=sys.stderr)
            sys.exit(1)
        success = manager.retry_task(sys.argv[3])
        print(json.dumps({"success": success}))

    elif command == "feedback":
        if len(sys.argv) < 6:
            print("Usage: ... feedback <task_id> <status> <result_json>", file=sys.stderr)
            sys.exit(1)
        task_id = sys.argv[3]
        status = sys.argv[4]
        with open(sys.argv[5], encoding="utf-8") as f:
            result = json.load(f)
        feedback_result = manager.process_feedback(task_id, status, result)
        print(json.dumps(feedback_result, ensure_ascii=False, indent=2))
        if not feedback_result.get("success"):
            sys.exit(1)

    elif command == "report":
        report = manager.get_progress_report()
        print(json.dumps(report, ensure_ascii=False, indent=2))

    else:
        print(f"Unknown command: {command}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
