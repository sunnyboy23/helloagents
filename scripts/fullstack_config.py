#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
全栈模式配置文件解析器

解析 .helloagents/fullstack.yaml 配置文件，
支持新格式：engineers + service_dependencies + service_catalog
"""

import json
import os
import re
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


SUPPORTED_ENGINEER_TYPES = {
    "frontend-react",
    "frontend-vue",
    "backend-java",
    "backend-python",
    "backend-go",
    "backend-nodejs",
    "mobile-ios",
    "mobile-android",
    "mobile-harmony",
}

DEFAULT_ENGINEER_SPECS = [
    ("fe-react-main", "frontend-react", "React 前端工程师"),
    ("fe-vue-main", "frontend-vue", "Vue 前端工程师"),
    ("be-java-main", "backend-java", "Java 后端工程师"),
    ("be-python-main", "backend-python", "Python 后端工程师"),
    ("be-go-main", "backend-go", "Go 后端工程师"),
    ("be-nodejs-main", "backend-nodejs", "Node.js 后端工程师"),
    ("mobile-ios-main", "mobile-ios", "iOS 工程师"),
    ("mobile-android-main", "mobile-android", "Android 工程师"),
    ("mobile-harmony-main", "mobile-harmony", "鸿蒙工程师"),
]

_KB_ROLE_SCAN_FILES = (
    "context.md",
    "modules/_index.md",
    "api/upstream/_index.md",
    "INDEX.md",
)

_CAPABILITY_STOPWORDS = {
    "项目",
    "模块",
    "目录",
    "说明",
    "索引",
    "文档",
    "功能",
    "服务",
    "接口",
    "上游",
    "下游",
    "知识库",
    "自动生成",
}


def build_default_fullstack_config() -> Dict[str, Any]:
    """Build a clean fullstack config with reusable default engineer agents."""
    engineers = []
    for engineer_id, engineer_type, engineer_name in DEFAULT_ENGINEER_SPECS:
        engineers.append(
            {
                "id": engineer_id,
                "type": engineer_type,
                "name": engineer_name,
                "projects": [],
            }
        )

    return {
        "version": "1.0",
        "mode": "fullstack",
        "engineers": engineers,
        "service_dependencies": {},
        "service_catalog": {},
        "orchestrator": {
            "auto_sync_tech_docs": True,
            "parallel_execution": True,
            "backend_first": True,
            "max_parallel_engineers": 4,
            "auto_init_project_kb": True,
            "cross_service_analysis": True,
        },
        "tech_doc_templates": {
            "api_contract": "templates/api_contract.md",
            "database_design": "templates/database_design.md",
            "architecture": "templates/architecture.md",
            "technical_solution": "templates/technical_solution.md",
            "task_breakdown": "templates/fullstack_tasks.md",
            "agent_assignment": "templates/fullstack_agents.md",
            "upstream_index": "templates/fullstack_upstream.md",
        },
    }


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
        if value == "{}":
            return {}
        if value == "[]":
            return []
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


def dump_yaml_fallback(data: Any, indent: int = 0) -> str:
    """将 Python 对象序列化为简化 YAML 字符串。"""
    lines = render_yaml_lines(data, indent)
    return "\n".join(lines)


def render_yaml_lines(data: Any, indent: int = 0) -> List[str]:
    """递归渲染 YAML 行。"""
    space = " " * indent
    lines: List[str] = []

    if isinstance(data, dict):
        if not data:
            return [f"{space}{{}}"]
        for key, value in data.items():
            if isinstance(value, dict):
                if value:
                    lines.append(f"{space}{key}:")
                    lines.extend(render_yaml_lines(value, indent + 2))
                else:
                    lines.append(f"{space}{key}: {{}}")
            elif isinstance(value, list):
                if value:
                    lines.append(f"{space}{key}:")
                    lines.extend(render_yaml_lines(value, indent + 2))
                else:
                    lines.append(f"{space}{key}: []")
            else:
                lines.append(f"{space}{key}: {format_yaml_scalar(value)}")
        return lines

    if isinstance(data, list):
        if not data:
            return [f"{space}[]"]
        for item in data:
            if isinstance(item, dict):
                if not item:
                    lines.append(f"{space}- {{}}")
                    continue
                keys = list(item.keys())
                first_key = keys[0]
                first_value = item[first_key]
                if isinstance(first_value, dict):
                    if first_value:
                        lines.append(f"{space}- {first_key}:")
                        lines.extend(render_yaml_lines(first_value, indent + 4))
                    else:
                        lines.append(f"{space}- {first_key}: {{}}")
                elif isinstance(first_value, list):
                    if first_value:
                        lines.append(f"{space}- {first_key}:")
                        lines.extend(render_yaml_lines(first_value, indent + 4))
                    else:
                        lines.append(f"{space}- {first_key}: []")
                else:
                    lines.append(f"{space}- {first_key}: {format_yaml_scalar(first_value)}")

                for key in keys[1:]:
                    value = item[key]
                    key_prefix = " " * (indent + 2)
                    if isinstance(value, dict):
                        if value:
                            lines.append(f"{key_prefix}{key}:")
                            lines.extend(render_yaml_lines(value, indent + 4))
                        else:
                            lines.append(f"{key_prefix}{key}: {{}}")
                    elif isinstance(value, list):
                        if value:
                            lines.append(f"{key_prefix}{key}:")
                            lines.extend(render_yaml_lines(value, indent + 4))
                        else:
                            lines.append(f"{key_prefix}{key}: []")
                    else:
                        lines.append(f"{key_prefix}{key}: {format_yaml_scalar(value)}")
            elif isinstance(item, list):
                lines.append(f"{space}-")
                lines.extend(render_yaml_lines(item, indent + 2))
            else:
                lines.append(f"{space}- {format_yaml_scalar(item)}")
        return lines

    return [f"{space}{format_yaml_scalar(data)}"]


def format_yaml_scalar(value: Any) -> str:
    """格式化 YAML 标量。"""
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, list):
        return "[" + ", ".join(format_yaml_scalar(v) for v in value) + "]"
    text = str(value)
    if text == "" or any(ch in text for ch in [":", "#", "{", "}", "[", "]"]) or text.strip() != text:
        return json.dumps(text, ensure_ascii=False)
    return text


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


def save_config(config_path: str, config: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
    """保存配置文件。"""
    try:
        path = Path(config_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        if HAS_YAML:
            content = yaml.safe_dump(
                config,
                allow_unicode=True,
                sort_keys=False,
                default_flow_style=False,
            )
        else:
            content = dump_yaml_fallback(config) + "\n"
        path.write_text(content, encoding="utf-8")
        return True, None
    except Exception as exc:
        return False, str(exc)


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

    service_catalog = config.get("service_catalog", {})
    if service_catalog and not isinstance(service_catalog, dict):
        errors.append("Field 'service_catalog' must be a mapping")
    elif isinstance(service_catalog, dict):
        for project_path, profile in service_catalog.items():
            if not isinstance(profile, dict):
                errors.append(f"service_catalog[{project_path}] must be an object")
                continue
            if "service_summary" in profile and not isinstance(profile.get("service_summary"), str):
                errors.append(f"service_catalog[{project_path}].service_summary must be a string")
            if "business_scope" in profile and not isinstance(profile.get("business_scope"), list):
                errors.append(f"service_catalog[{project_path}].business_scope must be a list")
            architecture = profile.get("architecture")
            if architecture is not None and not isinstance(architecture, dict):
                errors.append(f"service_catalog[{project_path}].architecture must be an object")

    return len(errors) == 0, errors


def get_service_profile(config: Dict[str, Any], project_path: str) -> Dict[str, Any]:
    """Return declared service profile for a project."""
    target = normalize_project_path(project_path)
    catalog = config.get("service_catalog", {}) or {}
    for path, profile in catalog.items():
        if normalize_project_path(path) == target:
            return profile if isinstance(profile, dict) else {}
    return {}


def normalize_project_path(project_path: str) -> str:
    """规范化项目路径用于比较（支持绝对路径和跨目录路径）。"""
    return str(Path(project_path).expanduser().resolve())


def find_engineer(config: Dict[str, Any], engineer_id: str) -> Optional[Dict[str, Any]]:
    """按工程师 ID 查找工程师定义。"""
    for engineer in config.get("engineers", []):
        if engineer.get("id") == engineer_id:
            return engineer
    return None


def find_project_owner(
    config: Dict[str, Any], project_path: str
) -> Optional[Tuple[Dict[str, Any], Dict[str, Any]]]:
    """查找项目当前绑定的工程师。"""
    target = normalize_project_path(project_path)
    for engineer in config.get("engineers", []):
        for project in engineer.get("projects", []):
            path = project.get("path")
            if path and normalize_project_path(path) == target:
                return engineer, project
    return None


def bind_project(
    config: Dict[str, Any],
    project_path: str,
    engineer_id: str,
    description: Optional[str] = None,
    tech_stack: Optional[List[str]] = None,
    auto_init_kb: bool = True,
    allow_rebind: bool = False,
) -> Dict[str, Any]:
    """将项目绑定到指定工程师。"""
    engineer = find_engineer(config, engineer_id)
    if engineer is None:
        return {
            "success": False,
            "error": f"Engineer not found: {engineer_id}",
        }

    existing = find_project_owner(config, project_path)
    if existing:
        current_engineer, current_project = existing
        if current_engineer.get("id") == engineer_id:
            return {
                "success": True,
                "updated": False,
                "message": "Project already bound to target engineer",
                "engineer_id": engineer_id,
                "project": current_project,
            }
        if not allow_rebind:
            return {
                "success": False,
                "error": "Project already bound to another engineer. Use --allow-rebind to move binding.",
                "current_engineer_id": current_engineer.get("id"),
                "current_engineer_type": current_engineer.get("type"),
            }
        current_engineer["projects"] = [
            p for p in current_engineer.get("projects", [])
            if normalize_project_path(p.get("path", "")) != normalize_project_path(project_path)
        ]

    resolved_path = normalize_project_path(project_path)
    project_item = {
        "path": resolved_path,
        "description": description or Path(resolved_path).name,
        "tech_stack": tech_stack or [],
        "auto_init_kb": auto_init_kb,
    }
    engineer.setdefault("projects", []).append(project_item)
    return {
        "success": True,
        "updated": True,
        "engineer_id": engineer_id,
        "engineer_type": engineer.get("type"),
        "project": project_item,
    }


def unbind_project(config: Dict[str, Any], project_path: str) -> Dict[str, Any]:
    """移除项目绑定。"""
    owner = find_project_owner(config, project_path)
    if owner is None:
        return {"success": False, "error": "Project binding not found"}
    engineer, _ = owner
    target = normalize_project_path(project_path)
    before = len(engineer.get("projects", []))
    engineer["projects"] = [
        p for p in engineer.get("projects", [])
        if normalize_project_path(p.get("path", "")) != target
    ]
    removed = before - len(engineer.get("projects", []))
    return {
        "success": True,
        "removed": removed > 0,
        "engineer_id": engineer.get("id"),
        "engineer_type": engineer.get("type"),
        "project_path": target,
    }


def list_engineers(config: Dict[str, Any]) -> List[Dict[str, Any]]:
    """获取工程师概览。"""
    result = []
    for engineer in config.get("engineers", []):
        result.append({
            "id": engineer.get("id"),
            "type": engineer.get("type"),
            "name": engineer.get("name"),
            "project_count": len(engineer.get("projects", [])),
            "projects": [p.get("path") for p in engineer.get("projects", [])],
        })
    return result


def _read_yes_no(prompt: str, default_yes: bool = True) -> bool:
    default_tip = "Y/n" if default_yes else "y/N"
    raw = input(f"{prompt} ({default_tip}): ").strip().lower()
    if not raw:
        return default_yes
    return raw in {"y", "yes"}


def _get_option_value(args: List[str], option: str) -> Optional[str]:
    """读取形如 --option value 的参数值。"""
    if option not in args:
        return None
    idx = args.index(option)
    if idx + 1 >= len(args):
        return None
    return args[idx + 1]


def wizard_bind(config: Dict[str, Any]) -> Dict[str, Any]:
    """交互式向导：按角色批量绑定多个本地绝对路径项目。"""
    engineers = config.setdefault("engineers", [])
    print("=== Fullstack 项目绑定向导 ===")
    print("支持一次绑定多个绝对路径项目，路径留空结束输入。")
    print()

    existing_types = sorted({e.get("type", "") for e in engineers if e.get("type")})
    available_types = sorted(SUPPORTED_ENGINEER_TYPES.union(existing_types))
    print("可选工程师类型:")
    for idx, engineer_type in enumerate(available_types, start=1):
        print(f"  {idx}. {engineer_type}")

    selected_type: Optional[str] = None
    while selected_type is None:
        raw = input("请输入工程师类型（编号或名称）: ").strip()
        if raw.isdigit():
            idx = int(raw) - 1
            if 0 <= idx < len(available_types):
                selected_type = available_types[idx]
        elif raw in available_types:
            selected_type = raw
        if selected_type is None:
            print("输入无效，请重新输入。")

    engineer_id = input("请输入工程师 ID（回车自动生成）: ").strip()
    if not engineer_id:
        suffix = selected_type.replace("-", "_")
        engineer_id = f"{suffix}_main"

    engineer = find_engineer(config, engineer_id)
    if engineer is None:
        name = input("请输入工程师名称（回车使用默认）: ").strip() or f"{selected_type} 工程师"
        engineer = {
            "id": engineer_id,
            "type": selected_type,
            "name": name,
            "projects": [],
        }
        engineers.append(engineer)
        print(f"已创建工程师: {engineer_id} ({selected_type})")
    else:
        if engineer.get("type") != selected_type:
            return {
                "success": False,
                "error": f"Engineer '{engineer_id}' already exists with type '{engineer.get('type')}', type mismatch",
            }
        print(f"使用已存在工程师: {engineer_id} ({selected_type})")

    allow_rebind = _read_yes_no("发现项目已绑定到其他工程师时，是否自动迁移绑定？", default_yes=False)
    auto_init_kb = _read_yes_no("是否为本批次项目启用 auto_init_kb？", default_yes=True)

    project_paths: List[str] = []
    print("请输入项目绝对路径（每行一个，回车结束）:")
    while True:
        raw_path = input("> ").strip()
        if not raw_path:
            break
        project_paths.append(raw_path)

    if not project_paths:
        return {"success": False, "error": "No project path provided"}

    print("\n将执行以下绑定:")
    for p in project_paths:
        print(f"- {normalize_project_path(p)}  ->  {engineer_id}")
    if not _read_yes_no("确认写入配置？", default_yes=True):
        return {"success": False, "cancelled": True, "error": "User cancelled"}

    results = []
    for path in project_paths:
        res = bind_project(
            config=config,
            project_path=path,
            engineer_id=engineer_id,
            auto_init_kb=auto_init_kb,
            allow_rebind=allow_rebind,
        )
        results.append(res)

    failed = [item for item in results if not item.get("success")]
    return {
        "success": len(failed) == 0,
        "engineer_id": engineer_id,
        "engineer_type": selected_type,
        "total": len(results),
        "failed": len(failed),
        "results": results,
    }


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

    target_norm = normalize_project_path(project_path)
    for engineer in engineers:
        for project in engineer.get("projects", []):
            configured_path = project.get("path")
            if not configured_path:
                continue
            if configured_path == project_path:
                return {
                    "id": engineer.get("id"),
                    "type": engineer.get("type"),
                    "name": engineer.get("name"),
                    "project": project
                }
            if normalize_project_path(configured_path) == target_norm:
                return {
                    "id": engineer.get("id"),
                    "type": engineer.get("type"),
                    "name": engineer.get("name"),
                    "project": project
                }

    return None


def _safe_read_text(path: Path) -> str:
    """安全读取文本，失败时返回空字符串。"""
    try:
        return path.read_text(encoding="utf-8")
    except Exception:
        return ""


def _pick_summary_from_text(content: str) -> str:
    """从 Markdown 文本中提取一句职责摘要。"""
    for raw in content.splitlines():
        line = raw.strip()
        if not line:
            continue
        if line.startswith(("#", ">", "```", "|", "- ", "* ")):
            continue
        # 跳过纯符号行
        if re.fullmatch(r"[-=*_`~\s]+", line):
            continue
        if len(line) < 6:
            continue
        return re.sub(r"\s+", " ", line)[:120]
    return ""


def _normalize_capability(token: str) -> str:
    """清洗能力标签片段。"""
    cleaned = token.strip()
    cleaned = re.sub(r"^[\-\*\d\.\)\(【】\[\]\s]+", "", cleaned)
    cleaned = re.sub(r"`", "", cleaned)
    cleaned = re.sub(r"\(.*?\)", "", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" :：;；,.，。|")
    return cleaned


def _extract_capabilities(*contents: str) -> List[str]:
    """从多个 Markdown 文本中提取能力标签。"""
    ranked: Dict[str, int] = {}

    def add_token(token: str, score: int):
        item = _normalize_capability(token)
        if not item:
            return
        if len(item) < 2 or len(item) > 28:
            return
        if item in _CAPABILITY_STOPWORDS:
            return
        ranked[item] = ranked.get(item, 0) + score

    for content in contents:
        if not content:
            continue
        for raw in content.splitlines():
            line = raw.strip()
            if not line:
                continue

            # 标题作为高权重能力来源
            if line.startswith("##"):
                add_token(line.lstrip("#").strip(), 3)
                continue

            # 列表项提取
            if line.startswith(("- ", "* ")):
                body = line[2:].strip()
                for part in re.split(r"[、,，/|；;]", body):
                    add_token(part, 2)

            # 句内 "A: B" 模式中的 A/B 作为候选
            if ":" in line or "：" in line:
                left, _, right = line.replace("：", ":").partition(":")
                add_token(left, 1)
                if right:
                    for part in re.split(r"[、,，/|；;]", right):
                        add_token(part, 1)

    ordered = sorted(ranked.items(), key=lambda item: (-item[1], item[0]))
    return [item for item, _score in ordered[:8]]


def _extract_relations(context_text: str, upstream_index_text: str) -> Tuple[List[str], List[str]]:
    """提取上游/下游服务线索。"""
    upstream: List[str] = []
    downstream: List[str] = []

    def add_unique(bucket: List[str], value: str):
        v = value.strip()
        if v and v not in bucket:
            bucket.append(v)

    # 从 upstream 索引表提取来源列
    if upstream_index_text:
        for line in upstream_index_text.splitlines():
            if not line.strip().startswith("|"):
                continue
            cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
            if len(cells) < 2:
                continue
            # 跳过表头和分隔线
            if cells[0] in {"文件", "File"}:
                continue
            if re.fullmatch(r"[-: ]+", cells[0]):
                continue
            source = cells[1]
            if source and source not in {"来源", "未知"}:
                add_unique(upstream, source)

    # 从 context 行里提取 上游/下游: xxx
    if context_text:
        for raw in context_text.splitlines():
            line = raw.strip()
            if not line:
                continue
            norm = line.replace("：", ":")
            if "上游" in line and ":" in norm:
                _, _, value = norm.partition(":")
                for part in re.split(r"[、,，/|；;]", value):
                    add_unique(upstream, _normalize_capability(part))
            if "下游" in line and ":" in norm:
                _, _, value = norm.partition(":")
                for part in re.split(r"[、,，/|；;]", value):
                    add_unique(downstream, _normalize_capability(part))

    return upstream[:6], downstream[:6]


def infer_project_role_from_kb(project_path: str) -> Dict[str, Any]:
    """从项目知识库提炼职责信息（配置补充层，非调度真值）。"""
    project_root = Path(project_path).expanduser()
    kb_root = project_root / ".helloagents"
    if not kb_root.exists():
        return {
            "available": False,
            "confidence": 0.0,
            "summary": "",
            "capabilities": [],
            "upstream_services": [],
            "downstream_services": [],
            "source_files": [],
            "reason": "kb_not_found",
        }

    loaded_texts: Dict[str, str] = {}
    for relative in _KB_ROLE_SCAN_FILES:
        target = kb_root / relative
        if target.exists():
            text = _safe_read_text(target)
            if text:
                loaded_texts[relative] = text

    if not loaded_texts:
        return {
            "available": False,
            "confidence": 0.0,
            "summary": "",
            "capabilities": [],
            "upstream_services": [],
            "downstream_services": [],
            "source_files": [],
            "reason": "kb_files_empty",
        }

    context_text = loaded_texts.get("context.md", "")
    index_text = loaded_texts.get("INDEX.md", "")
    modules_text = loaded_texts.get("modules/_index.md", "")
    upstream_text = loaded_texts.get("api/upstream/_index.md", "")

    summary = _pick_summary_from_text(context_text) or _pick_summary_from_text(index_text)
    capabilities = _extract_capabilities(context_text, modules_text, index_text)
    upstream_services, downstream_services = _extract_relations(context_text, upstream_text)

    confidence = 0.1
    if summary:
        confidence += 0.35
    if len(capabilities) >= 2:
        confidence += 0.25
    if upstream_services or downstream_services:
        confidence += 0.2
    if len(loaded_texts) >= 2:
        confidence += 0.1
    confidence = min(round(confidence, 2), 0.95)

    return {
        "available": True,
        "confidence": confidence,
        "summary": summary,
        "capabilities": capabilities,
        "upstream_services": upstream_services,
        "downstream_services": downstream_services,
        "source_files": sorted(loaded_texts.keys()),
        "reason": "ok",
    }


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
            project_path = project.get("path")
            kb_role_profile = infer_project_role_from_kb(project_path) if project_path else {
                "available": False,
                "confidence": 0.0,
                "summary": "",
                "capabilities": [],
                "upstream_services": [],
                "downstream_services": [],
                "source_files": [],
                "reason": "missing_project_path",
            }

            configured_description = str(project.get("description") or "").strip()
            kb_summary = str(kb_role_profile.get("summary") or "").strip()
            description = configured_description or kb_summary or None
            description_source = "configured" if configured_description else ("kb" if kb_summary else "empty")

            projects.append({
                "path": project_path,
                "description": description,
                "description_source": description_source,
                "tech_stack": project.get("tech_stack", []),
                "auto_init_kb": project.get("auto_init_kb", False),
                "engineer_id": engineer.get("id"),
                "engineer_type": engineer.get("type"),
                "engineer_name": engineer.get("name"),
                "role_confidence": kb_role_profile.get("confidence", 0.0),
                "capabilities": kb_role_profile.get("capabilities", []),
                "upstream_services": kb_role_profile.get("upstream_services", []),
                "downstream_services": kb_role_profile.get("downstream_services", []),
                "kb_role_profile": kb_role_profile,
            })

    return projects


def build_dispatch_plan(config: Dict[str, Any], projects: List[str], deps: Dict[str, Any]) -> Dict[str, Any]:
    """
    根据“是否已绑定工程师”生成可派发计划。

    Returns:
        包含可派发项目、未绑定项目、按职能工程师分组结果与分层执行顺序
    """
    assignments = []
    dispatchable_projects: List[str] = []
    unassigned_projects: List[str] = []
    grouped_by_engineer_type: Dict[str, List[str]] = {}

    for project in sorted(set(projects)):
        engineer = get_engineer_for_project(config, project)
        if engineer is None:
            assignments.append({
                "project": project,
                "dispatchable": False,
                "reason": "no_bound_engineer",
            })
            unassigned_projects.append(project)
            continue

        engineer_type = engineer.get("type")
        task_contract = _build_task_contract(config, project, deps, engineer)
        assignments.append({
            "project": project,
            "dispatchable": True,
            "engineer_id": engineer.get("id"),
            "engineer_type": engineer_type,
            "engineer_name": engineer.get("name"),
            "task_contract": task_contract,
        })
        dispatchable_projects.append(project)
        grouped_by_engineer_type.setdefault(engineer_type or "unknown", []).append(project)

    dispatch_execution_order = topological_sort(dispatchable_projects, deps) if dispatchable_projects else []
    for engineer_type, items in grouped_by_engineer_type.items():
        grouped_by_engineer_type[engineer_type] = sorted(set(items))

    warnings = []
    if unassigned_projects:
        warnings.append(
            {
                "type": "missing_binding",
                "blocking": False,
                "message": "存在未绑定工程师的项目，将跳过这些项目并继续执行已可派发项目。",
                "projects": sorted(set(unassigned_projects)),
                "suggestion": "如需覆盖这些项目，请后续执行 bind/wizard-bind 补绑。",
            }
        )

    return {
        "assignments": assignments,
        "dispatchable_projects": sorted(set(dispatchable_projects)),
        "unassigned_projects": sorted(set(unassigned_projects)),
        "grouped_by_engineer_type": grouped_by_engineer_type,
        "dispatch_execution_order": dispatch_execution_order,
        "continue_execution": len(dispatchable_projects) > 0,
        "advisory_only_unassigned": True,
        "warnings": warnings,
    }


def _build_task_contract(
    config: Dict[str, Any],
    project: str,
    deps: Dict[str, Any],
    engineer: Dict[str, Any],
) -> Dict[str, Any]:
    """为可派发项目生成轻量任务契约。"""
    upstream_projects = [
        dep for dep in deps.get(project, {}).get("depends_on", []) if dep
    ]
    downstream_projects = get_downstream_projects(config, project)
    engineer_type = str(engineer.get("type") or "unknown")

    risk_level = "medium"
    verify_mode = "standard"
    if upstream_projects or downstream_projects:
        risk_level = "high"
        verify_mode = "cross_project"
    if engineer_type.startswith("backend-") and downstream_projects:
        risk_level = "high"
        verify_mode = "api_contract_required"
    elif engineer_type.startswith("mobile-"):
        verify_mode = "integration_ready"

    reviewer_focus = ["依赖影响是否完整", "接口/文档是否同步", "是否满足上游前置条件"]
    tester_focus = ["关键路径可验证", "上下游联调风险已覆盖"]
    deliverables = ["代码变更摘要", "验证结果摘要"]

    if engineer_type.startswith("backend-"):
        reviewer_focus.insert(0, "接口兼容性与下游影响")
        tester_focus.append("接口变更与回归验证")
        deliverables.append("API/技术文档同步项")
    elif engineer_type.startswith("frontend-"):
        reviewer_focus.insert(0, "页面/交互是否适配上游契约")
        tester_focus.append("页面联调与回归验证")
        deliverables.append("页面适配说明")
    elif engineer_type.startswith("mobile-"):
        reviewer_focus.insert(0, "端上集成与发布约束")
        tester_focus.append("真机/集成验证说明")
        deliverables.append("端上集成说明")

    upstream_contracts = [
        f"{upstream}/.helloagents/api/upstream" for upstream in upstream_projects
    ]

    return {
        "verify_mode": verify_mode,
        "risk_level": risk_level,
        "reviewer_focus": reviewer_focus,
        "tester_focus": tester_focus,
        "deliverables": deliverables,
        "upstream_projects": upstream_projects,
        "downstream_projects": downstream_projects,
        "upstream_contracts": upstream_contracts,
    }


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

    # 拓扑排序确定执行顺序（原始全量）
    all_affected_list = list(all_affected)
    execution_order = topological_sort(all_affected_list, deps)
    dispatch_plan = build_dispatch_plan(config, all_affected_list, deps)

    return {
        "directly_affected": affected_projects,
        "all_affected": all_affected_list,
        "execution_order": execution_order,
        "dispatch_plan": dispatch_plan,
    }


def analyze_service_ownership(config: Dict[str, Any], requirement: str, candidate_projects: Optional[List[str]] = None) -> Dict[str, Any]:
    """Analyze owner service based on user-declared service catalog."""
    catalog = config.get("service_catalog", {}) or {}
    projects = candidate_projects or list(catalog.keys()) or [item["path"] for item in get_all_projects(config)]
    requirement_lower = str(requirement or "").lower()
    scored: List[Dict[str, Any]] = []
    for project in projects:
        profile = get_service_profile(config, project)
        reasons: List[str] = []
        score = 0
        haystacks: List[str] = []
        haystacks.extend(profile.get("owned_capabilities", []) or [])
        haystacks.extend(profile.get("business_scope", []) or [])
        haystacks.append(profile.get("service_summary", ""))
        architecture = profile.get("architecture", {}) or {}
        haystacks.extend(architecture.get("entrypoints", []) or [])
        haystacks.extend(architecture.get("key_modules", []) or [])
        for item in haystacks:
            text = str(item).strip().lower()
            if text and text in requirement_lower:
                score += 3
                reasons.append(f"命中声明字段: {item}")
        if profile.get("service_type") in {"domain", "workflow"} and any(word in requirement_lower for word in ("rule", "decision", "workflow", "domain", "写入", "执行")):
            score += 2
            reasons.append(f"需求特征与 service_type={profile.get('service_type')} 匹配")
        if profile.get("service_type") in {"report", "bff", "client"} and any(word in requirement_lower for word in ("query", "report", "history", "read", "list", "page", "查询", "历史", "报表", "页面")):
            score += 2
            reasons.append(f"需求特征与 service_type={profile.get('service_type')} 匹配")
        scored.append({"project": project, "score": score, "reasons": reasons, "profile": profile})

    scored.sort(key=lambda item: item["score"], reverse=True)
    owner = scored[0] if scored and scored[0]["score"] > 0 else None
    return {
        "owner_service": owner["project"] if owner else None,
        "candidate_services": [item["project"] for item in scored if item["score"] > 0],
        "rejected_services": [item["project"] for item in scored[1:] if item["score"] > 0],
        "ownership_reason": owner["reasons"] if owner else ["缺少足够的 service_catalog 命中，需人工判断"],
        "affected_projects_seed": [owner["project"]] if owner else [],
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
    service_profile = get_service_profile(config, project_path)
    if service_profile:
        cmd.extend(["--service-profile", json.dumps(service_profile, ensure_ascii=False)])

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
    result["scan_summary"] = summarize_kb_scan_result(result)
    return result


def summarize_kb_scan_result(init_result: Dict[str, Any]) -> Dict[str, Any]:
    """生成 KB 初始化扫描摘要质量信息。"""
    if not init_result.get("success", False):
        return {
            "quality": "failed",
            "score": 0,
            "reasons": [init_result.get("error", "kb_init_failed")],
            "needs_manual_enrichment": True,
        }

    if init_result.get("skipped", False):
        return {
            "quality": "skipped",
            "score": 0,
            "reasons": [init_result.get("reason", "kb_exists_or_disabled")],
            "needs_manual_enrichment": False,
        }

    score = 0
    reasons: List[str] = []

    modules = init_result.get("modules_detected", [])
    if modules:
        score += 2
        reasons.append(f"识别到模块 {len(modules)} 个")
    else:
        reasons.append("未识别到模块结构")

    tech = init_result.get("tech_stack", {})
    detected = tech.get("detected", [])
    scanner_detected = tech.get("scanner_detected", {})
    if detected:
        score += 1
        reasons.append(f"基础技术栈检测 {len(detected)} 项")
    if scanner_detected:
        score += 1
        reasons.append(f"扫描器识别特征 {len(scanner_detected)} 项")
    else:
        reasons.append("扫描器未识别到细粒度依赖特征")

    files_created = init_result.get("files_created", [])
    if any("context.md(scan_enriched)" in str(item) for item in files_created):
        score += 1
        reasons.append("context.md 已注入自动扫描摘要")
    else:
        reasons.append("context.md 未注入自动扫描摘要")

    if init_result.get("module_docs_created"):
        score += 1
        reasons.append(f"已生成模块文档 {len(init_result.get('module_docs_created', []))} 个")
    else:
        reasons.append("未生成模块文档")

    if init_result.get("enrichment_session", {}).get("required"):
        reasons.append("已生成工程师独立会话补全文档任务")

    if score >= 5:
        quality = "high"
    elif score >= 2:
        quality = "medium"
    else:
        quality = "low"

    return {
        "quality": quality,
        "score": score,  # 0~5
        "reasons": reasons,
        "needs_manual_enrichment": quality != "high",
    }


def main():
    """CLI 入口"""
    if len(sys.argv) < 2:
        print("Usage: fullstack_config.py <config_path|@auto> [command] [args...]", file=sys.stderr)
        print("Commands:", file=sys.stderr)
        print("  validate          - Validate config file", file=sys.stderr)
        print("  projects          - List all projects", file=sys.stderr)
        print("  engineers         - List engineers summary", file=sys.stderr)
        print("  engineer <path>   - Get engineer for project", file=sys.stderr)
        print("  deps <path>       - Get dependencies for project", file=sys.stderr)
        print("  impact <paths...>         - Analyze impact of changes", file=sys.stderr)
        print("  dispatch-plan <paths...>  - Analyze impact and return dispatchable projects only", file=sys.stderr)
        print("  detect-engineer <path>    - Auto detect engineer for project", file=sys.stderr)
        print("  cross-deps [paths...]     - Analyze cross-project dependencies", file=sys.stderr)
        print("  ensure-kb <path> [--force]- Check/init project knowledge base", file=sys.stderr)
        print("  ensure-kb-all [--force]   - Init KB for all configured projects", file=sys.stderr)
        print("  bind <path> --engineer-id <id> [--description txt] [--tech a,b] [--auto-init-kb true|false] [--allow-rebind]", file=sys.stderr)
        print("  unbind <path>             - Remove project binding", file=sys.stderr)
        print("  wizard-bind               - Interactive binding wizard", file=sys.stderr)
        sys.exit(1)

    config_path = sys.argv[1]
    if config_path == "@auto":
        project_root = os.environ.get("HELLOAGENTS_PROJECT_ROOT", str(Path.cwd()))
        kb_root = os.environ.get("HELLOAGENTS_KB_ROOT", str(Path.cwd() / ".helloagents"))
        try:
            try:
                from .fullstack_runtime import resolve_fullstack_config_file  # type: ignore
            except Exception:
                from fullstack_runtime import resolve_fullstack_config_file  # type: ignore

            config_path = str(resolve_fullstack_config_file(project_root=project_root, kb_root=kb_root))
        except Exception:
            config_path = str(Path(kb_root) / "fullstack" / "fullstack.yaml")

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

    elif command == "engineers":
        print(json.dumps(list_engineers(config), ensure_ascii=False, indent=2))

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

    elif command == "dispatch-plan":
        if len(sys.argv) < 4:
            print("Usage: fullstack_config.py <config> dispatch-plan <project_paths...>", file=sys.stderr)
            sys.exit(1)
        affected = sys.argv[3:]
        impact = analyze_impact(config, affected)
        dispatch_plan = impact.get("dispatch_plan", {})
        result = {
            "directly_affected": impact.get("directly_affected", []),
            "all_affected": impact.get("all_affected", []),
            "dispatchable_projects": dispatch_plan.get("dispatchable_projects", []),
            "unassigned_projects": dispatch_plan.get("unassigned_projects", []),
            "grouped_by_engineer_type": dispatch_plan.get("grouped_by_engineer_type", {}),
            "dispatch_execution_order": dispatch_plan.get("dispatch_execution_order", []),
            "continue_execution": dispatch_plan.get("continue_execution", False),
            "advisory_only_unassigned": dispatch_plan.get("advisory_only_unassigned", True),
            "warnings": dispatch_plan.get("warnings", []),
            "assignments": dispatch_plan.get("assignments", []),
        }
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

    elif command == "ownership":
        if len(sys.argv) < 4:
            print("Usage: fullstack_config.py <config> ownership <requirement> [project_paths...]", file=sys.stderr)
            sys.exit(1)
        requirement = sys.argv[3]
        candidates = sys.argv[4:] if len(sys.argv) > 4 else None
        result = analyze_service_ownership(config, requirement, candidates)
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

    elif command == "ensure-kb-all":
        force = "--force" in sys.argv[3:]
        projects = get_all_projects(config)
        results = []
        for item in projects:
            project_path = item.get("path")
            if not project_path:
                continue
            results.append(ensure_project_kb(config, project_path, force))

        quality_counts = {
            "high": 0,
            "medium": 0,
            "low": 0,
            "failed": 0,
            "skipped": 0,
        }
        for row in results:
            quality = (row.get("scan_summary", {}) or {}).get("quality")
            if quality in quality_counts:
                quality_counts[quality] += 1

        enrichment_required = sum(
            1
            for row in results
            if (row.get("enrichment_session") or {}).get("required", False)
        )

        summary = {
            "success": all(r.get("success", False) for r in results),
            "total": len(results),
            "completed": sum(1 for r in results if r.get("success", False)),
            "scan_quality_counts": quality_counts,
            "enrichment_required": enrichment_required,
            "results": results,
        }
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        if not summary["success"]:
            sys.exit(1)

    elif command == "bind":
        if len(sys.argv) < 5:
            print("Usage: fullstack_config.py <config> bind <project_path> --engineer-id <id> [--description txt] [--tech a,b] [--auto-init-kb true|false] [--allow-rebind]", file=sys.stderr)
            sys.exit(1)
        project_path = sys.argv[3]
        args = sys.argv[4:]
        engineer_id = _get_option_value(args, "--engineer-id")
        if not engineer_id:
            print("Missing required argument: --engineer-id", file=sys.stderr)
            sys.exit(1)
        description = None
        tech_stack: List[str] = []
        auto_init_kb = True
        allow_rebind = "--allow-rebind" in args

        description_val = _get_option_value(args, "--description")
        if description_val is not None:
            description = description_val

        tech_val = _get_option_value(args, "--tech")
        if tech_val is not None:
            raw = tech_val
            tech_stack = [item.strip() for item in raw.split(",") if item.strip()]

        auto_init_val = _get_option_value(args, "--auto-init-kb")
        if auto_init_val is not None:
            raw = auto_init_val.strip().lower()
            auto_init_kb = raw in {"true", "1", "yes", "y"}

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
                print(json.dumps({"success": False, "error": "Config becomes invalid after bind", "validation_errors": errors}, ensure_ascii=False, indent=2))
                sys.exit(1)
            ok, err = save_config(config_path, config)
            if not ok:
                print(json.dumps({"success": False, "error": f"Failed to save config: {err}"}, ensure_ascii=False, indent=2))
                sys.exit(1)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        if not result.get("success", False):
            sys.exit(1)

    elif command == "unbind":
        if len(sys.argv) < 4:
            print("Usage: fullstack_config.py <config> unbind <project_path>", file=sys.stderr)
            sys.exit(1)
        project_path = sys.argv[3]
        result = unbind_project(config, project_path)
        if result.get("success"):
            is_valid, errors = validate_config(config)
            if not is_valid:
                print(json.dumps({"success": False, "error": "Config becomes invalid after unbind", "validation_errors": errors}, ensure_ascii=False, indent=2))
                sys.exit(1)
            ok, err = save_config(config_path, config)
            if not ok:
                print(json.dumps({"success": False, "error": f"Failed to save config: {err}"}, ensure_ascii=False, indent=2))
                sys.exit(1)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        if not result.get("success", False):
            sys.exit(1)

    elif command == "wizard-bind":
        result = wizard_bind(config)
        if result.get("success"):
            is_valid, errors = validate_config(config)
            if not is_valid:
                print(json.dumps({"success": False, "error": "Config becomes invalid after wizard bind", "validation_errors": errors}, ensure_ascii=False, indent=2))
                sys.exit(1)
            ok, err = save_config(config_path, config)
            if not ok:
                print(json.dumps({"success": False, "error": f"Failed to save config: {err}"}, ensure_ascii=False, indent=2))
                sys.exit(1)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        if not result.get("success", False):
            sys.exit(1)

    else:
        print(f"Unknown command: {command}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
