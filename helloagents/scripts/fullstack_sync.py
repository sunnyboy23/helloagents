#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
全栈模式技术文档同步器

将后端工程师产出的 API 契约等技术文档同步到依赖方项目。
"""

import json
import os
import shutil
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional


def sync_tech_doc(
    source_path: str,
    target_projects: List[str],
    doc_type: str = "api_contract"
) -> Dict[str, Any]:
    """
    同步技术文档到目标项目

    Args:
        source_path: 源文档路径（如 ./backend/user-service/.helloagents/api/user_points.md）
        target_projects: 目标项目路径列表
        doc_type: 文档类型（api_contract, tech_spec, etc.）

    Returns:
        同步结果
    """
    source = Path(source_path).resolve()

    if not source.exists():
        return {
            "success": False,
            "error": f"Source file not found: {source_path}",
            "synced_to": []
        }

    synced = []
    errors = []

    for target_project in target_projects:
        target_base = Path(target_project).resolve()

        # 确定目标路径
        if doc_type == "api_contract":
            target_dir = target_base / ".helloagents" / "api" / "upstream"
        else:
            target_dir = target_base / ".helloagents" / "docs" / "upstream"

        try:
            # 创建目标目录
            target_dir.mkdir(parents=True, exist_ok=True)

            # 复制文件
            target_file = target_dir / source.name
            shutil.copy2(source, target_file)

            # 添加同步元信息
            meta_content = f"""<!--
同步自: {source}
同步时间: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
文档类型: {doc_type}
-->

"""
            # 在文件开头添加元信息
            original_content = target_file.read_text(encoding="utf-8")
            if not original_content.startswith("<!-- "):
                target_file.write_text(meta_content + original_content, encoding="utf-8")

            synced.append({
                "project": str(target_base),
                "path": str(target_file),
                "status": "success"
            })

        except Exception as e:
            errors.append({
                "project": str(target_base),
                "error": str(e)
            })

    return {
        "success": len(errors) == 0,
        "source": str(source),
        "doc_type": doc_type,
        "synced_to": synced,
        "errors": errors if errors else None
    }


def batch_sync_from_result(result_message: Dict[str, Any], base_path: str = ".") -> Dict[str, Any]:
    """
    从 ResultMessage 中提取 tech_docs 并批量同步

    Args:
        result_message: 工程师返回的 ResultMessage
        base_path: 基准路径（用于解析相对路径）

    Returns:
        批量同步结果
    """
    tech_docs = result_message.get("tech_docs", [])

    if not tech_docs:
        return {
            "success": True,
            "message": "No tech docs to sync",
            "results": []
        }

    results = []
    base = Path(base_path).resolve()

    for doc in tech_docs:
        doc_path = doc.get("path", "")
        sync_to = doc.get("sync_to", [])
        doc_type = doc.get("type", "api_contract")

        if not doc_path or not sync_to:
            continue

        # 解析相对路径
        if not os.path.isabs(doc_path):
            # 从 result_message 中获取项目路径
            project_path = result_message.get("project", ".")
            full_path = Path(base) / project_path / doc_path
        else:
            full_path = Path(doc_path)

        # 解析目标项目路径
        resolved_targets = []
        for target in sync_to:
            if not os.path.isabs(target):
                resolved_targets.append(str(base / target))
            else:
                resolved_targets.append(target)

        result = sync_tech_doc(str(full_path), resolved_targets, doc_type)
        results.append(result)

    all_success = all(r.get("success", False) for r in results)

    return {
        "success": all_success,
        "total_docs": len(tech_docs),
        "results": results
    }


def update_upstream_index(project_path: str) -> Dict[str, Any]:
    """
    更新项目的上游依赖索引

    扫描 .helloagents/api/upstream/ 目录，生成索引文件

    Args:
        project_path: 项目路径

    Returns:
        更新结果
    """
    project = Path(project_path).resolve()
    upstream_dir = project / ".helloagents" / "api" / "upstream"

    if not upstream_dir.exists():
        return {
            "success": True,
            "message": "No upstream directory",
            "files": []
        }

    # 扫描上游文档
    upstream_files = []
    for f in upstream_dir.glob("*.md"):
        if f.name.startswith("_"):
            continue

        # 读取元信息
        content = f.read_text(encoding="utf-8")
        source = None
        sync_time = None

        if content.startswith("<!-- "):
            # 解析元信息
            meta_end = content.find("-->")
            if meta_end > 0:
                meta = content[5:meta_end]
                for line in meta.split("\n"):
                    if "同步自:" in line:
                        source = line.split("同步自:")[1].strip()
                    elif "同步时间:" in line:
                        sync_time = line.split("同步时间:")[1].strip()

        upstream_files.append({
            "name": f.name,
            "path": str(f.relative_to(project)),
            "source": source,
            "sync_time": sync_time
        })

    # 生成索引
    index_path = upstream_dir / "_index.md"
    index_content = f"""# 上游 API 契约索引

> 自动生成于 {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}

| 文件 | 来源 | 同步时间 |
|------|------|----------|
"""

    for f in upstream_files:
        source_display = f["source"].split("/")[-3] if f["source"] else "未知"
        index_content += f"| [{f['name']}]({f['name']}) | {source_display} | {f['sync_time'] or '未知'} |\n"

    index_path.write_text(index_content, encoding="utf-8")

    return {
        "success": True,
        "index_path": str(index_path),
        "files": upstream_files
    }


def main():
    """CLI 入口"""
    if len(sys.argv) < 2:
        print("Usage: fullstack_sync.py <command> [args...]", file=sys.stderr)
        print("Commands:", file=sys.stderr)
        print("  sync <source> <target1,target2,...> [--type <doc_type>]", file=sys.stderr)
        print("  batch <result_json_file> [--base <path>]", file=sys.stderr)
        print("  index <project_path>", file=sys.stderr)
        sys.exit(1)

    command = sys.argv[1]

    if command == "sync":
        if len(sys.argv) < 4:
            print("Usage: fullstack_sync.py sync <source> <targets>", file=sys.stderr)
            sys.exit(1)

        source = sys.argv[2]
        targets = sys.argv[3].split(",")
        doc_type = "api_contract"

        # 解析 --type 参数
        if "--type" in sys.argv:
            idx = sys.argv.index("--type")
            if idx + 1 < len(sys.argv):
                doc_type = sys.argv[idx + 1]

        result = sync_tech_doc(source, targets, doc_type)
        print(json.dumps(result, ensure_ascii=False, indent=2))

    elif command == "batch":
        if len(sys.argv) < 3:
            print("Usage: fullstack_sync.py batch <result_json_file>", file=sys.stderr)
            sys.exit(1)

        result_file = sys.argv[2]
        base_path = "."

        # 解析 --base 参数
        if "--base" in sys.argv:
            idx = sys.argv.index("--base")
            if idx + 1 < len(sys.argv):
                base_path = sys.argv[idx + 1]

        with open(result_file, encoding="utf-8") as f:
            result_message = json.load(f)

        result = batch_sync_from_result(result_message, base_path)
        print(json.dumps(result, ensure_ascii=False, indent=2))

    elif command == "index":
        if len(sys.argv) < 3:
            print("Usage: fullstack_sync.py index <project_path>", file=sys.stderr)
            sys.exit(1)

        project_path = sys.argv[2]
        result = update_upstream_index(project_path)
        print(json.dumps(result, ensure_ascii=False, indent=2))

    else:
        print(f"Unknown command: {command}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
