#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
全栈模式配置文件解析器

解析 .helloagents/fullstack.yaml 配置文件，
支持新格式：engineers + service_dependencies
"""

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# 尝试导入 yaml，降级处理
try:
    import yaml
    HAS_YAML = True
except ImportError:
    HAS_YAML = False


def parse_yaml_fallback(content: str) -> Dict[str, Any]:
    """
    轻量 YAML 解析降级实现。

    目标是覆盖 fullstack.yaml 的常见结构（映射、缩进列表、内联列表、布尔/数字/字符串），
    避免在无 PyYAML 环境下配置不可用。
    """
    lines: List[Tuple[int, str]] = []
    for raw in content.splitlines():
        stripped = raw.strip()
        if not stripped or stripped.startswith("#"):
            continue
        indent = len(raw) - len(raw.lstrip(" "))
        lines.append((indent, stripped))

    def parse_scalar(value: str) -> Any:
        value = value.strip()
        if not value:
            return ""
        if value.startswith('"') and value.endswith('"'):
            return value[1:-1]
        if value.startswith("'") and value.endswith("'"):
            return value[1:-1]
        lower = value.lower()
        if lower == "true":
            return True
        if lower == "false":
            return False
        if lower in {"null", "~"}:
            return None
        if value.startswith("[") and value.endswith("]"):
            inner = value[1:-1].strip()
            if not inner:
                return []
            return [parse_scalar(item.strip()) for item in inner.split(",")]
        if value.isdigit():
            return int(value)
        try:
            return float(value)
        except ValueError:
            return value

    def split_kv(text: str) -> Tuple[str, str]:
        key, _, value = text.partition(":")
        key = key.strip()
        if (key.startswith('"') and key.endswith('"')) or (key.startswith("'") and key.endswith("'")):
            key = key[1:-1]
        return key, value.strip()

    def parse_mapping(index: int, indent: int) -> Tuple[Dict[str, Any], int]:
        data: Dict[str, Any] = {}
        i = index
        while i < len(lines):
            line_indent, text = lines[i]
            if line_indent < indent:
                break
            if line_indent > indent:
                # 上一行已消费该子块，这里直接返回给上层处理
                break
            if text.startswith("- "):
                break

            key, value = split_kv(text)
            i += 1
            if value:
                data[key] = parse_scalar(value)
                continue

            # 空值，读取嵌套块
            if i < len(lines) and lines[i][0] > line_indent:
                nested, i = parse_block(i, lines[i][0])
                data[key] = nested
            else:
                data[key] = {}
        return data, i

    def parse_list(index: int, indent: int) -> Tuple[List[Any], int]:
        items: List[Any] = []
        i = index
        while i < len(lines):
            line_indent, text = lines[i]
            if line_indent != indent or not text.startswith("- "):
                break

            item_text = text[2:].strip()
            i += 1

            # 列表项是 "key: value" 形式（对象起始）
            if ":" in item_text:
                key, value = split_kv(item_text)
                item_obj: Dict[str, Any] = {}
                if value:
                    item_obj[key] = parse_scalar(value)
                else:
                    if i < len(lines) and lines[i][0] > indent:
                        nested, i = parse_block(i, lines[i][0])
                        item_obj[key] = nested
                    else:
                        item_obj[key] = {}

                # 合并同一对象的其余字段（同层缩进）
                if i < len(lines) and lines[i][0] > indent and not lines[i][1].startswith("- "):
                    extra, i = parse_mapping(i, lines[i][0])
                    item_obj.update(extra)

                items.append(item_obj)
            elif item_text:
                items.append(parse_scalar(item_text))
            else:
                if i < len(lines) and lines[i][0] > indent:
                    nested, i = parse_block(i, lines[i][0])
                    items.append(nested)
                else:
                    items.append(None)

        return items, i

    def parse_block(index: int, indent: int) -> Tuple[Any, int]:
        if index >= len(lines):
            return {}, index
        _, text = lines[index]
        if text.startswith("- "):
            return parse_list(index, indent)
        return parse_mapping(index, indent)

    if not lines:
        return {}

    parsed, _ = parse_block(0, lines[0][0])
    if isinstance(parsed, dict):
        return parsed
    return {"root": parsed}


def load_config(config_path: str) -> Dict[str, Any]:
    """
    加载并解析配置文件

    Args:
        config_path: 配置文件路径

    Returns:
        解析后的配置字典
    """
    path = Path(config_path)
    if not path.exists():
        return {"error": f"Config file not found: {config_path}"}

    try:
        content = path.read_text(encoding="utf-8")

        if HAS_YAML:
            config = yaml.safe_load(content)
        else:
            # 降级解析
            config = parse_yaml_fallback(content)

        return config
    except Exception as e:
        return {"error": f"Failed to parse config: {e}"}


def validate_config(config: Dict[str, Any]) -> Tuple[bool, List[str]]:
    """
    验证配置文件格式

    Returns:
        (is_valid, error_messages)
    """
    errors = []

    # 检查必需字段
    if "version" not in config:
        errors.append("Missing required field: version")

    if "mode" not in config:
        errors.append("Missing required field: mode")
    elif config["mode"] != "fullstack":
        errors.append(f"Invalid mode: {config['mode']}, expected 'fullstack'")

    if "engineers" not in config:
        errors.append("Missing required field: engineers")
    elif not isinstance(config["engineers"], list):
        errors.append("Field 'engineers' must be a list")
    else:
        # 验证每个工程师定义
        for i, engineer in enumerate(config["engineers"]):
            if "id" not in engineer:
                errors.append(f"Engineer {i}: missing 'id'")
            if "type" not in engineer:
                errors.append(f"Engineer {i}: missing 'type'")
            if "projects" not in engineer:
                errors.append(f"Engineer {i}: missing 'projects'")
            elif not isinstance(engineer["projects"], list):
                errors.append(f"Engineer {i}: 'projects' must be a list")

    return len(errors) == 0, errors


def get_engineer_for_project(config: Dict[str, Any], project_path: str) -> Optional[Dict[str, Any]]:
    """
    根据项目路径查找对应的工程师

    Args:
        config: 配置字典
        project_path: 项目路径

    Returns:
        工程师信息或 None
    """
    engineers = config.get("engineers", [])

    for engineer in engineers:
        for project in engineer.get("projects", []):
            if project.get("path") == project_path:
                return {
                    "id": engineer.get("id"),
                    "type": engineer.get("type"),
                    "name": engineer.get("name"),
                    "project": project
                }

    return None


def get_all_projects(config: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    获取所有项目列表

    Returns:
        项目列表，每项包含 path, engineer_id, tech_stack 等
    """
    projects = []
    engineers = config.get("engineers", [])

    for engineer in engineers:
        for project in engineer.get("projects", []):
            projects.append({
                "path": project.get("path"),
                "description": project.get("description"),
                "tech_stack": project.get("tech_stack", []),
                "auto_init_kb": project.get("auto_init_kb", False),
                "engineer_id": engineer.get("id"),
                "engineer_type": engineer.get("type"),
                "engineer_name": engineer.get("name")
            })

    return projects


def get_service_dependencies(config: Dict[str, Any], project_path: str) -> List[str]:
    """
    获取项目的上游依赖

    Args:
        config: 配置字典
        project_path: 项目路径

    Returns:
        依赖的项目路径列表
    """
    deps = config.get("service_dependencies", {})
    project_deps = deps.get(project_path, {})
    return project_deps.get("depends_on", [])


def get_downstream_projects(config: Dict[str, Any], project_path: str) -> List[str]:
    """
    获取依赖该项目的下游项目

    Args:
        config: 配置字典
        project_path: 项目路径

    Returns:
        下游项目路径列表
    """
    downstream = []
    deps = config.get("service_dependencies", {})

    for path, dep_info in deps.items():
        if project_path in dep_info.get("depends_on", []):
            downstream.append(path)

    return downstream


def analyze_impact(config: Dict[str, Any], affected_projects: List[str]) -> Dict[str, Any]:
    """
    分析变更影响范围

    Args:
        config: 配置字典
        affected_projects: 直接受影响的项目列表

    Returns:
        影响分析结果，包含所有受影响的项目和执行顺序
    """
    deps = config.get("service_dependencies", {})
    all_affected = set(affected_projects)

    # 递归查找下游影响
    def find_downstream(project: str, visited: set):
        if project in visited:
            return
        visited.add(project)

        for path, dep_info in deps.items():
            if project in dep_info.get("depends_on", []):
                all_affected.add(path)
                find_downstream(path, visited)

    visited = set()
    for project in affected_projects:
        find_downstream(project, visited)

    # 拓扑排序确定执行顺序
    execution_order = topological_sort(list(all_affected), deps)

    return {
        "directly_affected": affected_projects,
        "all_affected": list(all_affected),
        "execution_order": execution_order
    }


def topological_sort(projects: List[str], deps: Dict[str, Any]) -> List[List[str]]:
    """
    对项目进行拓扑排序，返回层级列表

    Returns:
        层级列表，每层的项目可以并行执行
    """
    # 计算入度
    in_degree = {p: 0 for p in projects}

    for project in projects:
        for dep in deps.get(project, {}).get("depends_on", []):
            if dep in in_degree:
                in_degree[project] += 1

    # 分层
    layers = []
    remaining = set(projects)

    while remaining:
        # 找出入度为0的节点
        layer = [p for p in remaining if in_degree[p] == 0]
        if not layer:
            # 有循环依赖，返回剩余节点
            layers.append(list(remaining))
            break

        layers.append(layer)
        remaining -= set(layer)

        # 更新入度
        for project in remaining:
            for dep in deps.get(project, {}).get("depends_on", []):
                if dep in layer:
                    in_degree[project] -= 1

    return layers


def _normalize_tech(tech: str) -> str:
    """标准化技术栈标识（去版本、转小写）。"""
    return tech.split("@", 1)[0].strip().lower()


def _infer_engineer_type(project_type: str, tech_items: List[str]) -> Tuple[Optional[str], float, List[str]]:
    """
    根据项目类型与技术栈推断工程师类型。

    Returns:
        (engineer_type, confidence, reasons)
    """
    tech_set = {_normalize_tech(item) for item in tech_items}
    reasons: List[str] = []

    # 前端
    if "react" in tech_set or "next" in tech_set:
        reasons.append("检测到 React/Next 技术栈")
        return "frontend-react", 0.95, reasons
    if "vue" in tech_set or "nuxt" in tech_set:
        reasons.append("检测到 Vue/Nuxt 技术栈")
        return "frontend-vue", 0.95, reasons

    # 后端
    if "spring-boot" in tech_set or project_type == "java":
        reasons.append("检测到 Java/Spring Boot 技术栈")
        return "backend-java", 0.9, reasons
    if "fastapi" in tech_set or "django" in tech_set or (
        "python" in tech_set and project_type == "python"
    ):
        reasons.append("检测到 Python/FastAPI/Django 技术栈")
        return "backend-python", 0.9, reasons
    if "gin" in tech_set or "echo" in tech_set or project_type == "go":
        reasons.append("检测到 Go/Gin/Echo 技术栈")
        return "backend-go", 0.9, reasons
    if "nestjs" in tech_set or "express" in tech_set or (
        "node" in tech_set and project_type == "frontend"
    ):
        reasons.append("检测到 Node.js/NestJS/Express 技术栈")
        return "backend-nodejs", 0.85, reasons

    # 移动端
    if "swift" in tech_set or "swiftui" in tech_set or project_type == "ios":
        reasons.append("检测到 iOS/Swift 技术栈")
        return "mobile-ios", 0.9, reasons
    if "kotlin" in tech_set or "jetpack-compose" in tech_set or project_type == "android":
        reasons.append("检测到 Android/Kotlin 技术栈")
        return "mobile-android", 0.9, reasons
    if "arkts" in tech_set or "arkui" in tech_set or project_type == "harmony":
        reasons.append("检测到鸿蒙 ArkTS/ArkUI 技术栈")
        return "mobile-harmony", 0.9, reasons

    reasons.append("未识别到足够明确的技术栈特征")
    return None, 0.0, reasons


def auto_detect_engineer(config: Dict[str, Any], project_path: str) -> Dict[str, Any]:
    """
    自动识别项目应绑定的工程师类型（13.1）。

    识别顺序:
    1. 已配置绑定（最高优先级）
    2. 技术栈扫描推断
    """
    configured = get_engineer_for_project(config, project_path)
    if configured:
        return {
            "project_path": project_path,
            "source": "configured",
            "engineer_type": configured.get("type"),
            "engineer_id": configured.get("id"),
            "confidence": 1.0,
            "reasons": ["命中 fullstack.yaml 已配置项目绑定"],
            "candidates": [configured],
        }

    scanner = Path(__file__).with_name("fullstack_tech_scanner.py")
    try:
        raw = subprocess.run(
            [sys.executable, "-X", "utf8", str(scanner), project_path, "--json"],
            capture_output=True,
            text=True,
            check=True,
        )
        scan_result = json.loads(raw.stdout)
    except Exception as exc:
        return {
            "project_path": project_path,
            "source": "error",
            "error": f"技术栈扫描失败: {exc}",
        }

    project_type = scan_result.get("project_type", "unknown")
    detected = scan_result.get("detected", {})
    detected_items = list(detected.keys())
    inferred_type, confidence, reasons = _infer_engineer_type(project_type, detected_items)

    candidates = []
    for engineer in config.get("engineers", []):
        if engineer.get("type") == inferred_type:
            candidates.append(
                {
                    "id": engineer.get("id"),
                    "type": engineer.get("type"),
                    "name": engineer.get("name"),
                }
            )

    return {
        "project_path": project_path,
        "source": "detected",
        "project_type": project_type,
        "detected_tech_stack": detected,
        "engineer_type": inferred_type,
        "confidence": confidence,
        "reasons": reasons,
        "candidates": candidates,
    }


def _find_cycles(nodes: List[str], deps: Dict[str, Any]) -> List[List[str]]:
    """检测依赖图中的循环依赖。"""
    visited = set()
    stack = []
    in_stack = set()
    cycles: List[List[str]] = []

    def dfs(node: str):
        visited.add(node)
        stack.append(node)
        in_stack.add(node)
        for dep in deps.get(node, {}).get("depends_on", []):
            if dep not in nodes:
                continue
            if dep not in visited:
                dfs(dep)
            elif dep in in_stack:
                idx = stack.index(dep)
                cycles.append(stack[idx:] + [dep])
        stack.pop()
        in_stack.remove(node)

    for node in nodes:
        if node not in visited:
            dfs(node)

    return cycles


def analyze_cross_project_dependencies(
    config: Dict[str, Any], seed_projects: Optional[List[str]] = None
) -> Dict[str, Any]:
    """
    跨项目依赖分析（13.2）。

    Args:
        config: fullstack 配置
        seed_projects: 可选，指定分析起点项目；为空则分析全图
    """
    all_projects = [item["path"] for item in get_all_projects(config) if item.get("path")]
    deps = config.get("service_dependencies", {})
    downstream_map: Dict[str, List[str]] = {project: [] for project in all_projects}

    for project in all_projects:
        for upstream in deps.get(project, {}).get("depends_on", []):
            if upstream in downstream_map:
                downstream_map[upstream].append(project)

    if seed_projects:
        selected = set()

        def expand_downstream(project: str):
            if project in selected:
                return
            selected.add(project)
            for ds in downstream_map.get(project, []):
                expand_downstream(ds)

        for seed in seed_projects:
            expand_downstream(seed)
            # 把上游也纳入，便于完整观察链路
            for project in all_projects:
                if seed in deps.get(project, {}).get("depends_on", []):
                    selected.add(project)
        graph_projects = sorted(selected)
    else:
        graph_projects = sorted(all_projects)

    layers = topological_sort(graph_projects, deps)
    cycles = _find_cycles(graph_projects, deps)

    project_details = []
    for project in graph_projects:
        upstream = [dep for dep in deps.get(project, {}).get("depends_on", []) if dep in graph_projects]
        downstream = [ds for ds in downstream_map.get(project, []) if ds in graph_projects]
        project_details.append(
            {
                "project": project,
                "depends_on": upstream,
                "downstream": downstream,
                "upstream_count": len(upstream),
                "downstream_count": len(downstream),
            }
        )

    return {
        "scope": "partial" if seed_projects else "all",
        "seed_projects": seed_projects or [],
        "projects_count": len(graph_projects),
        "projects": graph_projects,
        "layers": layers,
        "cycles": cycles,
        "has_cycle": len(cycles) > 0,
        "project_details": project_details,
    }


def ensure_project_kb(config: Dict[str, Any], project_path: str, force: bool = False) -> Dict[str, Any]:
    """
    检查并初始化项目知识库（2.7）。
    """
    project_info = None
    for project in get_all_projects(config):
        if project.get("path") == project_path:
            project_info = project
            break

    if project_info is None:
        return {
            "success": False,
            "project_path": project_path,
            "error": "Project is not configured in fullstack.yaml",
        }

    kb_index = Path(project_path) / ".helloagents" / "INDEX.md"
    if kb_index.exists() and not force:
        return {
            "success": True,
            "project_path": project_path,
            "skipped": True,
            "reason": "Knowledge base already exists",
            "kb_index": str(kb_index),
        }

    if not project_info.get("auto_init_kb", False) and not force:
        return {
            "success": True,
            "project_path": project_path,
            "skipped": True,
            "reason": "auto_init_kb is disabled",
        }

    init_script = Path(__file__).with_name("fullstack_init_project_kb.py")
    cmd = [sys.executable, "-X", "utf8", str(init_script), project_path, "--json"]

    tech_stack = project_info.get("tech_stack", [])
    if tech_stack:
        cmd.extend(["--tech", ",".join(tech_stack)])

    engineer_id = project_info.get("engineer_id")
    if engineer_id:
        cmd.extend(["--engineer", engineer_id])

    if force:
        cmd.append("--force")

    try:
        raw = subprocess.run(cmd, capture_output=True, text=True, check=True)
        result = json.loads(raw.stdout)
    except subprocess.CalledProcessError as exc:
        return {
            "success": False,
            "project_path": project_path,
            "error": f"init_project_kb failed: {exc.stderr.strip() or exc.stdout.strip()}",
        }
    except Exception as exc:
        return {
            "success": False,
            "project_path": project_path,
            "error": f"Failed to parse init result: {exc}",
        }

    result["project_path"] = project_path
    result["engineer_id"] = engineer_id
    return result


def main():
    """CLI 入口"""
    if len(sys.argv) < 2:
        print("Usage: fullstack_config.py <config_path> [command] [args...]", file=sys.stderr)
        print("Commands:", file=sys.stderr)
        print("  validate          - Validate config file", file=sys.stderr)
        print("  projects          - List all projects", file=sys.stderr)
        print("  engineer <path>   - Get engineer for project", file=sys.stderr)
        print("  deps <path>       - Get dependencies for project", file=sys.stderr)
        print("  impact <paths...>         - Analyze impact of changes", file=sys.stderr)
        print("  detect-engineer <path>    - Auto detect engineer for project", file=sys.stderr)
        print("  cross-deps [paths...]     - Analyze cross-project dependencies", file=sys.stderr)
        print("  ensure-kb <path> [--force]- Check/init project knowledge base", file=sys.stderr)
        sys.exit(1)

    config_path = sys.argv[1]
    command = sys.argv[2] if len(sys.argv) > 2 else "validate"

    config = load_config(config_path)

    if "error" in config:
        print(json.dumps(config, ensure_ascii=False))
        sys.exit(1)

    if command == "validate":
        is_valid, errors = validate_config(config)
        result = {"valid": is_valid, "errors": errors}
        print(json.dumps(result, ensure_ascii=False, indent=2))
        sys.exit(0 if is_valid else 1)

    elif command == "projects":
        projects = get_all_projects(config)
        print(json.dumps(projects, ensure_ascii=False, indent=2))

    elif command == "engineer":
        if len(sys.argv) < 4:
            print("Usage: fullstack_config.py <config> engineer <project_path>", file=sys.stderr)
            sys.exit(1)
        project_path = sys.argv[3]
        engineer = get_engineer_for_project(config, project_path)
        print(json.dumps(engineer, ensure_ascii=False, indent=2))

    elif command == "deps":
        if len(sys.argv) < 4:
            print("Usage: fullstack_config.py <config> deps <project_path>", file=sys.stderr)
            sys.exit(1)
        project_path = sys.argv[3]
        deps = get_service_dependencies(config, project_path)
        downstream = get_downstream_projects(config, project_path)
        print(json.dumps({"depends_on": deps, "downstream": downstream}, ensure_ascii=False, indent=2))

    elif command == "impact":
        if len(sys.argv) < 4:
            print("Usage: fullstack_config.py <config> impact <project_paths...>", file=sys.stderr)
            sys.exit(1)
        affected = sys.argv[3:]
        result = analyze_impact(config, affected)
        print(json.dumps(result, ensure_ascii=False, indent=2))

    elif command == "detect-engineer":
        if len(sys.argv) < 4:
            print("Usage: fullstack_config.py <config> detect-engineer <project_path>", file=sys.stderr)
            sys.exit(1)
        project_path = sys.argv[3]
        result = auto_detect_engineer(config, project_path)
        print(json.dumps(result, ensure_ascii=False, indent=2))

    elif command == "cross-deps":
        seed_projects = sys.argv[3:] if len(sys.argv) > 3 else None
        result = analyze_cross_project_dependencies(config, seed_projects)
        print(json.dumps(result, ensure_ascii=False, indent=2))

    elif command == "ensure-kb":
        if len(sys.argv) < 4:
            print("Usage: fullstack_config.py <config> ensure-kb <project_path> [--force]", file=sys.stderr)
            sys.exit(1)
        project_path = sys.argv[3]
        force = "--force" in sys.argv[4:]
        result = ensure_project_kb(config, project_path, force)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        if not result.get("success", False):
            sys.exit(1)

    else:
        print(f"Unknown command: {command}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
