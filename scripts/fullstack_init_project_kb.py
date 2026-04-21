#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
全栈模式项目知识库初始化器

为指定项目目录初始化 .helloagents 知识库结构，
根据技术栈选择对应的模板文件。
"""

import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# 技术栈到模板目录的映射
TECH_STACK_TEMPLATES = {
    # 后端
    "spring-boot": "java",
    "spring": "java",
    "java": "java",
    "fastapi": "python",
    "django": "python",
    "flask": "python",
    "python": "python",
    "express": "node",
    "nestjs": "node",
    "koa": "node",
    "node": "node",
    "gin": "go",
    "echo": "go",
    "go": "go",
    # 前端
    "react": "react",
    "vue": "vue",
    "angular": "angular",
    "next.js": "react",
    "nuxt": "vue",
    # 移动端
    "swift": "ios",
    "swiftui": "ios",
    "ios": "ios",
    "kotlin": "android",
    "jetpack-compose": "android",
    "android": "android",
    "arkts": "harmony",
    "harmonyos": "harmony",
}

SCAN_SUMMARY_BEGIN = "<!-- HELLOAGENTS_AUTO_SCAN_BEGIN -->"
SCAN_SUMMARY_END = "<!-- HELLOAGENTS_AUTO_SCAN_END -->"
CORE_KB_FILES = (
    "INDEX.md",
    "context.md",
    "guidelines.md",
    "CHANGELOG.md",
    "modules/_index.md",
)

REFERENCE_DOC_CANDIDATES = (
    "AGENTS.md",
    "CLAUDE.md",
    "README.md",
    "README_CN.md",
    "docs/README.md",
)


def get_template_dir() -> Path:
    """获取模板目录路径"""
    # 相对于脚本位置的模板目录
    script_dir = Path(__file__).parent
    template_dir = script_dir.parent / "templates" / "project_kb"
    return template_dir


def _slugify_module_path(module_path: str) -> str:
    """Convert a module path into a stable markdown filename."""
    slug = re.sub(r"[^a-zA-Z0-9._-]+", "-", module_path.strip("/"))
    slug = slug.replace(".", "-")
    slug = slug.strip("-").lower()
    return slug or "module"


def _read_template_file(template_name: str, filename: str) -> str:
    """Load a KB template file with default fallback."""
    template_root = get_template_dir()
    candidates = [
        template_root / template_name / filename,
        template_root / "default" / filename,
    ]
    for path in candidates:
        if path.exists():
            return path.read_text(encoding="utf-8")
    return ""


def _unique_keep_order(items: List[str]) -> List[str]:
    """Return ordered unique list."""
    seen = set()
    ordered: List[str] = []
    for item in items:
        if not item or item in seen:
            continue
        seen.add(item)
        ordered.append(item)
    return ordered


def _clean_line(line: str) -> str:
    """Normalize a markdown/plain-text line."""
    text = re.sub(r"`", "", line).strip()
    text = re.sub(r"\s+", " ", text)
    return text.strip(" -:|")


def _extract_reference_docs(project_path: Path) -> List[Path]:
    """Collect existing project docs that can be used as KB references."""
    found: List[Path] = []
    for rel in REFERENCE_DOC_CANDIDATES:
        candidate = project_path / rel
        if candidate.is_file():
            found.append(candidate)
    return found


def _extract_doc_summary(content: str) -> str:
    """Extract a short summary sentence from markdown content."""
    for raw in content.splitlines():
        line = _clean_line(raw)
        if not line:
            continue
        if line.startswith(("#", ">", "*", "-", "|")):
            line = _clean_line(line.lstrip("#>*- "))
        if not line or len(line) < 6:
            continue
        if line.lower() in {"agents.md", "readme.md", "claude.md", "to be continued...", "to be continued"}:
            continue
        if line.startswith(("http://", "https://")):
            continue
        if line.lower().startswith(("usage", "目录", "project", "项目结构")):
            continue
        return line[:120]
    return ""


def _extract_bullets_from_doc(content: str, limit: int = 6) -> List[str]:
    """Extract useful bullet-like statements from a reference document."""
    bullets: List[str] = []
    for raw in content.splitlines():
        stripped = raw.strip()
        if not stripped:
            continue
        if stripped.startswith(("- ", "* ")):
            item = _clean_line(stripped[2:])
            if item and len(item) >= 4 and not item.startswith(("http://", "https://")):
                bullets.append(item)
        elif re.match(r"^\d+\.\s+", stripped):
            item = _clean_line(re.sub(r"^\d+\.\s+", "", stripped))
            if item and len(item) >= 4 and not item.startswith(("http://", "https://")):
                bullets.append(item)
        if len(bullets) >= limit:
            break
    return bullets


def _load_reference_notes(project_path: Path) -> List[Dict[str, Any]]:
    """Read available project docs and return concise facts."""
    notes: List[Dict[str, Any]] = []
    for path in _extract_reference_docs(project_path):
        content = _read_text(path)
        notes.append(
            {
                "path": str(path.relative_to(project_path)),
                "summary": _extract_doc_summary(content),
                "bullets": _extract_bullets_from_doc(content),
            }
        )
    return notes


def _load_package_json_info(project_path: Path) -> Dict[str, Any]:
    """Load package.json facts for frontend/node projects."""
    info: Dict[str, Any] = {
        "name": "",
        "description": "",
        "scripts": {},
        "dependencies": {},
        "dev_dependencies": {},
    }
    package_json = project_path / "package.json"
    if not package_json.exists():
        return info
    try:
        payload = json.loads(package_json.read_text(encoding="utf-8"))
        info["name"] = str(payload.get("name", "")).strip()
        info["description"] = str(payload.get("description", "")).strip()
        info["scripts"] = payload.get("scripts", {}) or {}
        info["dependencies"] = payload.get("dependencies", {}) or {}
        info["dev_dependencies"] = payload.get("devDependencies", {}) or {}
    except Exception:
        pass
    return info


def _load_pom_info(project_path: Path) -> Dict[str, Any]:
    """Load a few Maven facts from pom.xml."""
    info: Dict[str, Any] = {
        "artifact_id": "",
        "packaging": "",
        "modules": [],
        "dependencies": [],
    }
    pom = project_path / "pom.xml"
    if not pom.exists():
        return info
    content = _read_text(pom)
    artifact = re.search(r"<artifactId>([^<]+)</artifactId>", content)
    packaging = re.search(r"<packaging>([^<]+)</packaging>", content)
    info["artifact_id"] = artifact.group(1).strip() if artifact else ""
    info["packaging"] = packaging.group(1).strip() if packaging else ""
    info["modules"] = re.findall(r"<module>([^<]+)</module>", content)
    dependency_hits: List[str] = []
    for key in ("spring-boot", "mybatis-plus", "mysql", "redis", "mapstruct", "lombok", "rocketmq"):
        if key in content.lower():
            dependency_hits.append(key)
    info["dependencies"] = dependency_hits
    return info


def _detect_package_manager(project_path: Path) -> str:
    """Infer project package/build manager from lock/build files."""
    if (project_path / "package-lock.json").exists():
        return "npm"
    if (project_path / "pnpm-lock.yaml").exists():
        return "pnpm"
    if (project_path / "yarn.lock").exists():
        return "yarn"
    if (project_path / "pom.xml").exists():
        return "maven"
    if (project_path / "build.gradle").exists() or (project_path / "build.gradle.kts").exists():
        return "gradle"
    if (project_path / "requirements.txt").exists() or (project_path / "pyproject.toml").exists():
        return "python"
    if (project_path / "go.mod").exists():
        return "go"
    return "未识别"


def _detect_style_solution(project_path: Path, package_info: Dict[str, Any]) -> List[str]:
    """Infer actual style solution from dependencies and source files."""
    deps = {**package_info.get("dependencies", {}), **package_info.get("dev_dependencies", {})}
    styles: List[str] = []
    if "antd" in deps:
        styles.append("Ant Design")
    if "tailwindcss" in deps or (project_path / "tailwind.config.js").exists() or (project_path / "tailwind.config.ts").exists():
        styles.append("TailwindCSS")
    if list(project_path.rglob("*.less")):
        styles.append("Less")
    if list(project_path.rglob("*.scss")) or list(project_path.rglob("*.sass")):
        styles.append("Sass/SCSS")
    if list(project_path.rglob("*.module.css")) or list(project_path.rglob("*.module.less")):
        styles.append("CSS Modules")
    if not styles and list(project_path.rglob("*.css")):
        styles.append("CSS")
    return _unique_keep_order(styles)


def _detect_test_tools(project_path: Path, package_info: Dict[str, Any], pom_info: Dict[str, Any]) -> List[str]:
    """Infer project test stack."""
    tools: List[str] = []
    deps = {**package_info.get("dependencies", {}), **package_info.get("dev_dependencies", {})}
    scripts = package_info.get("scripts", {}) or {}
    if "jest" in deps or "test" in scripts:
        if "jest" in deps or "jest" in str(scripts.get("test", "")).lower():
            tools.append("Jest")
    if "react-testing-library" in json.dumps(deps).lower() or "@testing-library/react" in deps:
        tools.append("React Testing Library")
    if (project_path / "service" / "src" / "test" / "java").exists() or "junit" in " ".join(pom_info.get("dependencies", [])):
        tools.append("JUnit")
    return _unique_keep_order(tools)


def _detect_quality_tools(project_path: Path, package_info: Dict[str, Any]) -> List[str]:
    """Infer lint/format/commit tools from project files."""
    tools: List[str] = []
    deps = {**package_info.get("dependencies", {}), **package_info.get("dev_dependencies", {})}
    scripts = package_info.get("scripts", {}) or {}
    if "eslint" in deps or any("eslint" in str(value).lower() for value in scripts.values()):
        tools.append("ESLint")
    if "stylelint" in deps or any("stylelint" in str(value).lower() for value in scripts.values()):
        tools.append("Stylelint")
    if "prettier" in deps or any("prettier" in str(value).lower() for value in scripts.values()):
        tools.append("Prettier")
    if "commitlint" in json.dumps(deps).lower():
        tools.append("Commitlint")
    return _unique_keep_order(tools)


def _infer_language_and_framework(
    project_path: Path,
    effective_stack: List[str],
    scan_result: Dict[str, Any],
    package_info: Dict[str, Any],
    pom_info: Dict[str, Any],
) -> Tuple[str, str, str]:
    """Infer language/framework/build tool descriptions."""
    project_type = scan_result.get("project_type", "unknown")
    detected = scan_result.get("detected", {}) or {}
    language_parts: List[str] = []
    framework_parts: List[str] = []
    build_tool = "未识别"

    if project_type == "frontend":
        if "typescript" in detected:
            language_parts.append("TypeScript")
        language_parts.append("JavaScript")
        if "react" in detected or "react" in effective_stack:
            framework_parts.append("React")
        if "umi" in json.dumps(package_info).lower():
            framework_parts.append("Umi")
            build_tool = "umi"
        elif "vite" in detected:
            framework_parts.append("Vite")
            build_tool = "vite"
        elif "webpack" in detected:
            build_tool = "webpack"
    elif project_type == "java":
        language_parts.append("Java")
        if "spring-boot" in detected or "spring-boot" in effective_stack or "spring-boot" in pom_info.get("dependencies", []):
            framework_parts.append("Spring Boot")
        if "zzscf:" in _read_text(project_path / "src" / "main" / "resources" / "scf-spring.xml") or "zzscf:" in _read_text(project_path / "service" / "src" / "main" / "resources" / "scf-spring.xml"):
            framework_parts.append("SCF")
        build_tool = "maven" if (project_path / "pom.xml").exists() or (project_path / "service" / "pom.xml").exists() else "gradle"
    elif project_type == "python":
        language_parts.append("Python")
    elif project_type == "go":
        language_parts.append("Go")

    if not language_parts:
        language_parts.append("未识别")
    framework_parts = [item for item in framework_parts if item]
    if not framework_parts:
        framework_parts.append("未识别")

    return (
        " / ".join(_unique_keep_order(language_parts)),
        " + ".join(_unique_keep_order(framework_parts)),
        build_tool,
    )


def _render_template(content: str, project: Path, engineer_id: Optional[str]) -> str:
    """Replace standard placeholders in KB template content."""
    return (
        content.replace("{项目名称}", project.name)
        .replace("{创建时间}", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
        .replace("{工程师ID}", engineer_id or "未指定")
    )


def _detect_kb_state(kb_root: Path) -> Dict[str, Any]:
    """Inspect whether the project KB is complete, partial, or missing."""
    if not kb_root.exists():
        return {
            "exists": False,
            "state": "missing",
            "missing_core_files": list(CORE_KB_FILES),
            "history_preserved": False,
        }

    missing = [item for item in CORE_KB_FILES if not (kb_root / item).exists()]
    history_preserved = any((kb_root / name).exists() for name in ("plan", "archive", "sessions"))
    module_docs = list((kb_root / "modules").glob("*.md")) if (kb_root / "modules").exists() else []
    non_index_module_docs = [path for path in module_docs if path.name != "_index.md"]

    if not missing and non_index_module_docs:
        state = "complete"
    elif not missing:
        state = "partial"
    else:
        state = "partial"

    return {
        "exists": True,
        "state": state,
        "missing_core_files": missing,
        "history_preserved": history_preserved,
        "module_doc_count": len(non_index_module_docs),
    }


def _find_module_entry_files(project_path: Path, module_path: str) -> List[str]:
    """Find a few representative files for a scanned module path."""
    if module_path.startswith("java-package/"):
        return []

    target_dir = project_path / module_path
    if not target_dir.is_dir():
        return []

    include_suffixes = {".py", ".ts", ".tsx", ".js", ".jsx", ".java", ".go", ".kt", ".swift", ".vue"}
    collected: List[str] = []
    try:
        for path in sorted(target_dir.rglob("*"), key=lambda p: str(p)):
            if not path.is_file():
                continue
            if path.suffix.lower() not in include_suffixes:
                continue
            collected.append(str(path.relative_to(project_path)))
            if len(collected) >= 5:
                break
    except Exception:
        return []
    return collected


def _write_module_docs(
    kb_root: Path,
    project_path: Path,
    engineer_id: Optional[str],
    modules: List[str],
    force: bool,
) -> List[str]:
    """Generate lightweight module docs for scanned modules."""
    created: List[str] = []
    modules_dir = kb_root / "modules"
    modules_dir.mkdir(parents=True, exist_ok=True)

    for index, module_path in enumerate(modules, start=1):
        slug = _slugify_module_path(module_path)
        doc_path = modules_dir / f"{slug}.md"
        if doc_path.exists() and not force:
            continue

        entry_files = _find_module_entry_files(project_path, module_path)
        lines = [
            f"# 模块文档: `{module_path}`",
            "",
            "> 由 HelloAGENTS 在项目 KB 初始化阶段自动生成，供工程师后续独立会话补全。",
            "",
            "## 基本信息",
            "",
            f"- 模块编号: M{index:02d}",
            f"- 模块路径: `{module_path}`",
            f"- 工程师: {engineer_id or '未指定'}",
            "",
            "## 推测职责",
            "",
            f"- 当前根据目录命名推测，该模块承担与 `{module_path}` 相关的业务或技术职责。",
            "- 需要工程师在独立会话中根据真实代码补充精确职责边界。",
            "",
            "## 候选入口文件",
            "",
        ]
        if entry_files:
            lines.extend([f"- `{item}`" for item in entry_files])
        else:
            lines.append("- 暂未识别到明确入口文件（可能需要按包路径或构建配置进一步分析）")

        lines.extend(
            [
                "",
                "## 待补充",
                "",
                "- 核心职责与业务边界",
                "- 关键类 / 关键函数 / 关键组件",
                "- 上下游依赖关系",
                "- 重要配置项与运行约束",
                "",
            ]
        )
        doc_path.write_text("\n".join(lines), encoding="utf-8")
        created.append(str(doc_path.relative_to(project_path)))

    return created


def _write_modules_index(
    modules_index: Path,
    modules: List[str],
    force: bool = False,
) -> bool:
    """Write module index with links to generated module docs."""
    if modules_index.exists() and not force:
        existing = _read_text(modules_index)
    else:
        existing = ""

    lines = [
        "# 模块索引",
        "",
        f"> 自动生成于 {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        "",
    ]
    if modules:
        for idx, module in enumerate(modules, start=1):
            slug = _slugify_module_path(module)
            lines.append(f"- M{idx:02d}: [`{module}`]({slug}.md)")
    else:
        lines.append("- 暂未识别到模块，请后续补充。")
    lines.append("")

    rendered = "\n".join(lines)
    if existing == rendered:
        return False
    modules_index.write_text(rendered, encoding="utf-8")
    return True


def _build_enrichment_session_content(
    project_path: Path,
    kb_root: Path,
    engineer_id: Optional[str],
    modules: List[str],
    kb_state: Dict[str, Any],
) -> str:
    """Build an isolated-session KB enrichment request for the assigned engineer."""
    lines = [
        "# 项目知识库补全文档任务",
        "",
        "> 该任务用于对应工程师 agent 在独立会话中整理项目知识文档，请勿与其他项目共用同一上下文。",
        "",
        "## 执行要求",
        "",
        "- 必须使用独立会话 / 独立上下文，仅分析当前项目。",
        "- 必须保留现有 `.helloagents/plan/`、`archive/`、`sessions/`、`CHANGELOG.md` 等历史记录，不得覆盖已有任务与归档。",
        "- 以项目真实代码为准补充文档，不以历史计划或变更记录替代项目全貌。",
        "",
        "## 项目信息",
        "",
        f"- 项目路径: `{project_path}`",
        f"- 知识库路径: `{kb_root}`",
        f"- 工程师: {engineer_id or '未指定'}",
        f"- 当前 KB 状态: {kb_state.get('state', 'unknown')}",
        f"- 缺失核心文档: {', '.join(kb_state.get('missing_core_files', [])) or '无'}",
        "",
        "## 优先补全文档",
        "",
        "- `context.md`: 项目定位、技术栈、运行方式、目录职责、关键入口",
        "- `modules/*.md`: 各模块职责、关键类/函数/组件、依赖关系",
        "- `modules/_index.md`: 模块索引与链接校正",
        "- `api/` 下需要的接口草稿或上游索引（如能从代码可靠识别）",
        "",
        "## 已扫描到的模块",
        "",
    ]
    if modules:
        lines.extend([f"- `{item}`" for item in modules])
    else:
        lines.append("- 暂未扫描到明确模块，请结合项目目录结构补充")

    lines.extend(
        [
            "",
            "## 完成标准",
            "",
            "- 项目级文档能帮助新工程师快速理解项目整体结构",
            "- 文档内容与代码一致，不覆盖历史任务与改动记录",
            "- 所有补充都基于当前项目独立上下文完成",
            "",
        ]
    )
    return "\n".join(lines)


def _write_enrichment_session_request(
    kb_root: Path,
    project_path: Path,
    engineer_id: Optional[str],
    modules: List[str],
    kb_state: Dict[str, Any],
) -> str:
    """Create an isolated-session enrichment request for engineer agents."""
    sessions_dir = kb_root / "sessions"
    sessions_dir.mkdir(parents=True, exist_ok=True)
    safe_engineer = re.sub(r"[^a-zA-Z0-9_-]+", "-", engineer_id or "unassigned").strip("-") or "unassigned"
    filename = f"kb_enrichment_{safe_engineer}.md"
    session_file = sessions_dir / filename
    content = _build_enrichment_session_content(project_path, kb_root, engineer_id, modules, kb_state)
    session_file.write_text(content, encoding="utf-8")
    return str(session_file.relative_to(project_path))


def detect_tech_stack(project_path: Path) -> List[str]:
    """
    检测项目技术栈（简化版，完整版见 fullstack_tech_scanner.py）

    Returns:
        检测到的技术栈列表
    """
    detected = []

    # 检测常见配置文件
    if (project_path / "package.json").exists():
        try:
            with open(project_path / "package.json", encoding="utf-8") as f:
                pkg = json.load(f)
                deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
                if "react" in deps:
                    detected.append("react")
                if "vue" in deps:
                    detected.append("vue")
                if "express" in deps:
                    detected.append("express")
                if "fastify" in deps:
                    detected.append("node")
        except (json.JSONDecodeError, IOError):
            pass

    if (project_path / "pom.xml").exists():
        detected.append("java")
        # 简单检测 Spring Boot
        try:
            content = (project_path / "pom.xml").read_text(encoding="utf-8")
            if "spring-boot" in content:
                detected.append("spring-boot")
        except IOError:
            pass

    if (project_path / "build.gradle").exists() or (project_path / "build.gradle.kts").exists():
        detected.append("java")

    if (project_path / "requirements.txt").exists() or (project_path / "pyproject.toml").exists():
        detected.append("python")
        # 检测 FastAPI
        req_file = project_path / "requirements.txt"
        if req_file.exists():
            try:
                content = req_file.read_text(encoding="utf-8").lower()
                if "fastapi" in content:
                    detected.append("fastapi")
                elif "django" in content:
                    detected.append("django")
                elif "flask" in content:
                    detected.append("flask")
            except IOError:
                pass

    if (project_path / "go.mod").exists():
        detected.append("go")

    if (project_path / "Podfile").exists() or (project_path / "Package.swift").exists():
        detected.append("ios")

    if (project_path / "oh-package.json5").exists():
        detected.append("harmony")

    return detected


def select_template(tech_stack: List[str]) -> str:
    """
    根据技术栈选择最合适的模板

    Args:
        tech_stack: 技术栈列表（declared + detected）

    Returns:
        模板目录名（如 'java', 'python', 'react'）
    """
    # 按优先级匹配
    for tech in tech_stack:
        tech_lower = tech.lower()
        if tech_lower in TECH_STACK_TEMPLATES:
            return TECH_STACK_TEMPLATES[tech_lower]

    # 默认返回通用模板
    return "default"


def _run_tech_scanner(project_path: Path) -> Dict[str, Any]:
    """调用技术栈扫描器，返回 project_type + detected。"""
    scanner = Path(__file__).with_name("fullstack_tech_scanner.py")
    result: Dict[str, Any] = {"project_type": "unknown", "detected": {}}

    if not scanner.exists():
        return result

    try:
        proc = subprocess.run(
            [sys.executable, "-X", "utf8", str(scanner), str(project_path), "--json"],
            capture_output=True,
            text=True,
            check=True,
        )
        parsed = json.loads(proc.stdout)
        if isinstance(parsed, dict):
            result["project_type"] = parsed.get("project_type", "unknown")
            result["detected"] = parsed.get("detected", {}) or {}
    except Exception:
        pass
    return result


def _read_text(path: Path) -> str:
    """安全读取 UTF-8 文本。"""
    try:
        return path.read_text(encoding="utf-8")
    except Exception:
        return ""


def _extract_java_identity(project_path: Path) -> Dict[str, str]:
    """从 pom.xml 或 gradle 中提取 Java 服务标识。"""
    identity = {"artifact_id": "", "name": ""}
    pom = project_path / "pom.xml"
    if pom.exists():
        content = _read_text(pom)
        artifact = re.search(r"<artifactId>([^<]+)</artifactId>", content)
        name = re.search(r"<name>([^<]+)</name>", content)
        if artifact:
            identity["artifact_id"] = artifact.group(1).strip()
        if name:
            identity["name"] = name.group(1).strip()
    return identity


def _find_common_java_package_root(java_root: Path) -> Optional[Path]:
    """Descend into a Java source tree and find the likely package root."""
    current = java_root
    for _ in range(6):
        children = [item for item in current.iterdir() if item.is_dir() and not item.name.startswith(".")]
        files = [item for item in current.iterdir() if item.is_file()]
        if files:
            break
        if len(children) != 1:
            break
        current = children[0]
    return current if current != java_root else None


def _collect_directory_samples(base: Path, max_depth: int = 2, max_items: int = 12) -> List[str]:
    """Collect representative child directories under a base path."""
    items: List[str] = []
    if not base.is_dir():
        return items
    queue: List[Tuple[Path, int]] = [(base, 0)]
    while queue and len(items) < max_items:
        current, depth = queue.pop(0)
        try:
            children = sorted(
                [item for item in current.iterdir() if item.is_dir() and not item.name.startswith(".")],
                key=lambda p: p.name,
            )
        except Exception:
            continue
        for child in children:
            items.append(str(child))
            if len(items) >= max_items:
                break
            if depth + 1 < max_depth:
                queue.append((child, depth + 1))
    return items


def _scan_project_modules(project_path: Path) -> List[str]:
    """扫描项目模块结构（轻量级，面向 KB 初始化）。"""
    modules: List[str] = []

    # 常见顶层模块目录
    top_dirs = [
        "src", "app", "services", "modules", "packages", "controllers",
        "models", "repository", "mapper", "api", "core", "common",
        "contract", "service",
    ]
    exclude = {".git", ".idea", ".vscode", "node_modules", "__pycache__", "target", "dist", "build"}

    for dir_name in top_dirs:
        base = project_path / dir_name
        if not base.is_dir():
            continue
        try:
            for child in sorted(base.iterdir(), key=lambda p: p.name):
                if child.is_dir() and child.name not in exclude and not child.name.startswith("."):
                    modules.append(f"{dir_name}/{child.name}")
        except Exception:
            continue

    # Java 包结构（src/main/java/...）补充
    java_roots = [project_path / "src" / "main" / "java"]
    for module_dir in ("service", "contract"):
        java_roots.append(project_path / module_dir / "src" / "main" / "java")

    for java_main in java_roots:
        if not java_main.is_dir():
            continue
        try:
            package_root = _find_common_java_package_root(java_main) or java_main
            prefix = "java"
            if java_main.parts[-4:-3]:
                maybe_module = java_main.parent.parent.parent.name
                if maybe_module in {"service", "contract"}:
                    prefix = maybe_module
            for child in sorted(package_root.iterdir(), key=lambda p: p.name):
                if not child.is_dir() or child.name.startswith("."):
                    continue
                modules.append(f"{prefix}/{child.name}")
                if len(modules) >= 20:
                    break
        except Exception:
            pass

    # 去重保序
    dedup: List[str] = []
    seen = set()
    for item in modules:
        if item not in seen:
            dedup.append(item)
            seen.add(item)
    return dedup[:20]


def _summarize_directory_overview(project_path: Path, modules: List[str]) -> List[str]:
    """Generate directory overview lines from detected modules."""
    lines: List[str] = []
    for module in modules[:12]:
        if module.startswith("src/"):
            label = module.split("/", 1)[1]
            lines.append(f"- `{module}`: `{label}` 相关代码或资源目录。")
        elif module.startswith(("service/", "contract/")):
            label = module.split("/", 1)[1]
            lines.append(f"- `{module}`: `{label}` 分层目录。")
        else:
            lines.append(f"- `{module}`: 已识别的重要目录。")
    return lines


def _infer_project_name(project_path: Path, package_info: Dict[str, Any], pom_info: Dict[str, Any], reference_notes: List[Dict[str, Any]]) -> str:
    """Infer project display name from real project files."""
    if package_info.get("description"):
        return str(package_info["description"])
    if pom_info.get("artifact_id"):
        return str(pom_info["artifact_id"])
    for note in reference_notes:
        summary = note.get("summary", "")
        if summary and len(summary) <= 60 and not summary.startswith("http"):
            return summary
    return project_path.name


def _infer_project_status(project_path: Path) -> str:
    """Return a conservative project status."""
    if (project_path / ".git").exists():
        return "维护中/开发中"
    return "未明确"


def _infer_project_scope(project_type: str) -> Tuple[List[str], List[str]]:
    """Return in-scope / out-of-scope hints by project type."""
    if project_type == "frontend":
        return (
            ["前端页面、交互、状态与接口调用层", "与现有前端工程体系一致的页面/组件改动"],
            ["后端服务实现", "数据库与基础设施变更"],
        )
    if project_type == "java":
        return (
            ["服务接口、业务编排、领域规则、持久化与配置实现"],
            ["前端页面实现", "无证据支持的跨服务职责推断"],
        )
    return (["以仓库中实际存在的代码与配置为准"], ["未识别部分需要人工确认"])


def _normalize_service_profile(raw: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Normalize user-declared service profile."""
    profile = raw or {}
    architecture = profile.get("architecture", {}) if isinstance(profile.get("architecture"), dict) else {}
    return {
        "service_type": str(profile.get("service_type", "")).strip(),
        "service_summary": str(profile.get("service_summary", "")).strip(),
        "business_scope": [str(item).strip() for item in profile.get("business_scope", []) if str(item).strip()],
        "owned_capabilities": [str(item).strip() for item in profile.get("owned_capabilities", []) if str(item).strip()],
        "bounded_context": str(profile.get("bounded_context", "")).strip(),
        "anti_capabilities": [str(item).strip() for item in profile.get("anti_capabilities", []) if str(item).strip()],
        "architecture": {
            "style": str(architecture.get("style", "")).strip(),
            "entrypoints": [str(item).strip() for item in architecture.get("entrypoints", []) if str(item).strip()],
            "key_modules": [str(item).strip() for item in architecture.get("key_modules", []) if str(item).strip()],
        },
    }


def _render_context_content(
    project_path: Path,
    engineer_id: Optional[str],
    declared_tech_stack: Optional[List[str]],
    effective_stack: List[str],
    scan_result: Dict[str, Any],
    modules: List[str],
    service_profile: Optional[Dict[str, Any]] = None,
) -> str:
    """Render a uniform, evidence-based context.md."""
    package_info = _load_package_json_info(project_path)
    pom_info = _load_pom_info(project_path)
    reference_notes = _load_reference_notes(project_path)
    project_type = scan_result.get("project_type", "unknown")
    project_name = _infer_project_name(project_path, package_info, pom_info, reference_notes)
    project_desc = package_info.get("description") or (reference_notes[0]["summary"] if reference_notes else "")
    package_manager = _detect_package_manager(project_path)
    language, framework, build_tool = _infer_language_and_framework(
        project_path=project_path,
        effective_stack=effective_stack,
        scan_result=scan_result,
        package_info=package_info,
        pom_info=pom_info,
    )
    test_tools = _detect_test_tools(project_path, package_info, pom_info)
    style_solution = _detect_style_solution(project_path, package_info)
    scripts = package_info.get("scripts", {}) or {}
    in_scope, out_scope = _infer_project_scope(project_type)
    directory_lines = _summarize_directory_overview(project_path, modules)
    profile = _normalize_service_profile(service_profile)

    lines = [
        "# 项目上下文",
        "",
        "> 此文件由 HelloAGENTS 根据项目真实文件扫描生成，内容应以代码和配置事实为准。",
        "",
        "## 1. 基本信息",
        "",
        "```yaml",
        f"名称: {project_path.name}",
        f"显示名: {project_name}",
        f"描述: {project_desc or '未从仓库文档中提取到明确描述'}",
        f"类型: {project_type or 'unknown'}",
        f"状态: {_infer_project_status(project_path)}",
        f"工程师: {engineer_id or '未指定'}",
        "```",
        "",
        "## 2. 技术上下文",
        "",
        "```yaml",
        f"语言: {language}",
        f"框架: {framework}",
        f"包管理器: {package_manager}",
        f"构建工具: {build_tool}",
        f"测试工具: {', '.join(test_tools) if test_tools else '未明确'}",
        f"样式方案: {', '.join(style_solution) if style_solution else '未明确'}",
        f"声明技术栈: {', '.join(declared_tech_stack or []) if declared_tech_stack else '无'}",
        f"扫描技术栈: {', '.join([f'{k}{v}' if v else k for k, v in sorted((scan_result.get('detected', {}) or {}).items())]) or '未检测到'}",
        f"生效技术栈: {', '.join(effective_stack) if effective_stack else '未识别'}",
        "```",
        "",
        "## 3. 项目概述",
        "",
        "### 核心职责",
    ]
    if profile.get("service_summary"):
        lines.append(f"- {profile['service_summary']}")
    elif reference_notes:
        first_bullets = reference_notes[0].get("bullets", [])
        if first_bullets:
            lines.extend([f"- {item}" for item in first_bullets[:4]])
        elif project_desc:
            lines.append(f"- {project_desc}")
        else:
            lines.append("- 需根据源码和现有业务页面/服务职责进一步补充。")
    else:
        lines.append("- 需根据源码和现有业务页面/服务职责进一步补充。")

    lines.extend(["", "### 业务范围"])
    if profile.get("business_scope"):
        lines.extend([f"- {item}" for item in profile["business_scope"]])
    else:
        lines.append("- 未在 service_catalog 中声明，需后续补充。")

    lines.extend(["", "### 架构入口"])
    if profile["architecture"].get("entrypoints"):
        lines.extend([f"- `{item}`" for item in profile["architecture"]["entrypoints"]])
    else:
        lines.append("- 未在 service_catalog 中声明关键入口。")

    lines.extend(["", "### 项目边界", "```yaml", "范围内:"])
    lines.extend([f"  - {item}" for item in in_scope])
    if profile.get("owned_capabilities"):
        lines.extend([f"  - {item}" for item in profile["owned_capabilities"]])
    lines.append("范围外:")
    lines.extend([f"  - {item}" for item in out_scope])
    if profile.get("anti_capabilities"):
        lines.extend([f"  - {item}" for item in profile["anti_capabilities"]])
    lines.extend(["```", "", "## 4. 关键命令", ""])

    if scripts:
        for key in ("start", "dev", "build", "lint", "test"):
            if key in scripts:
                lines.append(f"- `{package_manager} run {key}`: `{scripts[key]}`")
    elif package_manager == "maven":
        lines.extend(
            [
                "- `mvn clean package -DskipTests`: 构建项目",
                "- `mvn test`: 运行测试",
            ]
        )
    else:
        lines.append("- 未从项目配置中识别到标准运行命令。")

    lines.extend(["", "## 5. 目录结构概览", ""])
    if directory_lines:
        lines.extend(directory_lines)
    else:
        lines.append("- 未识别到稳定目录结构，需人工补充。")

    lines.extend(["", "## 6. 可参考项目文档", ""])
    if reference_notes:
        for note in reference_notes:
            summary = note.get("summary") or "已存在项目说明文档"
            lines.append(f"- `{note['path']}`: {summary}")
    else:
        lines.append("- 未发现可直接参考的 `AGENTS.md` / `README.md` / `CLAUDE.md`。")

    return "\n".join(lines) + "\n"


def _render_guidelines_content(
    project_path: Path,
    declared_tech_stack: Optional[List[str]],
    effective_stack: List[str],
    scan_result: Dict[str, Any],
    service_profile: Optional[Dict[str, Any]] = None,
) -> str:
    """Render a uniform, evidence-based guidelines.md."""
    package_info = _load_package_json_info(project_path)
    pom_info = _load_pom_info(project_path)
    reference_notes = _load_reference_notes(project_path)
    project_type = scan_result.get("project_type", "unknown")
    package_manager = _detect_package_manager(project_path)
    style_solution = _detect_style_solution(project_path, package_info)
    test_tools = _detect_test_tools(project_path, package_info, pom_info)
    quality_tools = _detect_quality_tools(project_path, package_info)
    scripts = package_info.get("scripts", {}) or {}
    profile = _normalize_service_profile(service_profile)
    lines = [
        "# 项目开发指南",
        "",
        "> 本文件根据仓库中的真实代码、配置和现有项目文档自动生成。若文档与代码冲突，以代码事实为准。",
        "",
        "## 1. 事实来源",
        "",
        "- `package.json` / `pom.xml` / 构建配置",
        "- 仓库目录结构与源码文件分布",
        "- 已存在的 `README.md` / `AGENTS.md` / `CLAUDE.md`（若存在）",
        "- 本次扫描得到的技术栈与模块结构",
        "",
        "## 2. 必须遵循的基线",
        "",
        "- 优先沿用仓库现有技术栈与目录组织，不引入未被项目采用的新范式。",
        "- 新增或修改文档时，优先补充真实代码事实，不写无法从仓库证明的规范。",
        "- 若项目已有 AI 协作说明文档，新增约定应与其保持一致，冲突时以代码事实和当前仓库配置为准。",
        "- fullstack 项目 KB 初始化以用户在 service_catalog 中的职责声明为第一事实来源，自动扫描只做轻量补充。",
        "",
        "## 3. 技术栈约束",
        "",
        f"- 包管理器/构建: `{package_manager}`",
        f"- 声明技术栈: {', '.join(declared_tech_stack or []) if declared_tech_stack else '无'}",
        f"- 扫描技术栈: {', '.join([f'{k}{v}' if v else k for k, v in sorted((scan_result.get('detected', {}) or {}).items())]) or '未检测到'}",
        f"- 生效技术栈: {', '.join(effective_stack) if effective_stack else '未识别'}",
    ]

    if style_solution:
        lines.append(f"- 当前样式方案: {', '.join(style_solution)}")
    else:
        lines.append("- 当前样式方案: 未从仓库中识别到明确方案，需保持与现有文件一致。")

    if "TailwindCSS" in style_solution:
        lines.append("- 已检测到 TailwindCSS，可在现有 Tailwind 体系内扩展。")
    else:
        lines.append("- 未检测到 TailwindCSS，请不要在项目指南中假设或优先推广 TailwindCSS。")

    lines.extend(["", "## 4. 开发方式建议", ""])
    if profile.get("service_summary"):
        lines.append(f"- 当前服务定位: {profile['service_summary']}")
    if profile.get("anti_capabilities"):
        lines.append(f"- 禁止承载: {'；'.join(profile['anti_capabilities'])}")
    if project_type == "frontend":
        lines.append("- 页面、组件、样式、接口封装优先复用现有前端工程模式。")
        if "Ant Design" in style_solution:
            lines.append("- 已检测到 Ant Design，新增界面优先复用现有 Ant Design 组件与样式体系。")
        if "Less" in style_solution:
            lines.append("- 已检测到 Less 文件，样式扩展优先保持 Less 体系一致。")
        if "umi" in json.dumps(package_info).lower():
            lines.append("- 已检测到 Umi，路由、构建和开发命令优先遵循 Umi 约定。")
    elif project_type == "java":
        lines.append("- Java 服务开发优先遵循现有 Maven 结构、包分层和 RPC/配置体系。")
        if pom_info.get("modules"):
            lines.append(f"- 当前为多模块 Maven 项目，已识别模块: {', '.join(pom_info['modules'])}。")
        if "zzscf:" in _read_text(project_path / "src" / "main" / "resources" / "scf-spring.xml") or "zzscf:" in _read_text(project_path / "service" / "src" / "main" / "resources" / "scf-spring.xml"):
            lines.append("- 已检测到 SCF 配置，接口边界和远程调用应遵循现有 SCF 体系。")
    else:
        lines.append("- 由于项目类型识别有限，开发时应以现有代码风格和配置为准。")

    lines.extend(["", "## 5. 质量与验证", ""])
    if test_tools:
        lines.append(f"- 测试工具: {', '.join(test_tools)}")
    else:
        lines.append("- 测试工具: 未明确，新增关键逻辑时至少补充可执行验证方式。")
    if quality_tools:
        lines.append(f"- 质量工具: {', '.join(quality_tools)}")
    else:
        lines.append("- 质量工具: 未从配置中识别到完整链路，提交前需按仓库现状自查。")
    for key in ("lint", "test", "build"):
        if key in scripts:
            lines.append(f"- 推荐执行 `{package_manager} run {key}`")
    if package_manager == "maven":
        lines.extend(["- 推荐执行 `mvn test`", "- 推荐执行 `mvn clean package -DskipTests`"])

    lines.extend(["", "## 6. 待补充项", ""])
    if reference_notes:
        lines.append("- 已有项目文档可继续人工校正，但补充范围应控制在源码无法直接表达的业务背景。")
    lines.append("- 若存在业务规范、发布流程或权限约束，需在确认后补充到此文件，不应凭空生成。")
    return "\n".join(lines) + "\n"


def _guess_service_role(project_name: str, identity: Dict[str, str], modules: List[str]) -> str:
    """基于项目名和模块路径生成服务职责摘要。"""
    raw = " ".join(
        [
            project_name.lower(),
            identity.get("artifact_id", "").lower(),
            identity.get("name", "").lower(),
            " ".join(modules).lower(),
        ]
    )
    hints = [
        ("user", "用户与账号域服务"),
        ("account", "账户域服务"),
        ("auth", "认证授权服务"),
        ("order", "订单域服务"),
        ("payment", "支付结算服务"),
        ("inventory", "库存域服务"),
        ("product", "商品域服务"),
        ("member", "会员域服务"),
        ("coupon", "优惠券营销服务"),
        ("gateway", "网关/BFF 服务"),
    ]
    for key, role in hints:
        if key in raw:
            return role
    return "业务能力服务（建议补充精确职责描述）"


def _build_scan_summary(
    project_path: Path,
    engineer_id: Optional[str],
    declared_tech_stack: Optional[List[str]],
    effective_stack: List[str],
    scan_result: Dict[str, Any],
    modules: List[str],
) -> str:
    """生成可写入 context.md 的自动扫描摘要块。"""
    identity = _extract_java_identity(project_path)
    project_name = project_path.name
    service_role = _guess_service_role(project_name, identity, modules)
    detected_stack = scan_result.get("detected", {}) or {}
    detected_list = [f"{k}{v}" if v else k for k, v in sorted(detected_stack.items())]
    project_type = scan_result.get("project_type", "unknown")

    lines = [
        SCAN_SUMMARY_BEGIN,
        "## 自动扫描摘要",
        "",
        f"- 扫描时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        f"- 项目路径: {project_path}",
        f"- 工程师: {engineer_id or '未指定'}",
        f"- 项目类型: {project_type}",
        f"- 推测服务角色: {service_role}",
        "",
        "### 技术栈（扫描结果）",
        "",
        f"- 声明技术栈: {', '.join(declared_tech_stack or []) if declared_tech_stack else '无'}",
        f"- 检测技术栈: {', '.join(detected_list) if detected_list else '未检测到'}",
        f"- 生效技术栈: {', '.join(effective_stack) if effective_stack else '未识别'}",
        "",
        "### 模块结构（扫描结果）",
        "",
    ]

    if modules:
        for item in modules:
            lines.append(f"- {item}")
    else:
        lines.append("- 未识别到明确模块目录（可手动补充）")

    if identity.get("artifact_id") or identity.get("name"):
        lines.extend(
            [
                "",
                "### 服务标识（构建文件）",
                "",
                f"- artifactId: {identity.get('artifact_id') or '未识别'}",
                f"- name: {identity.get('name') or '未识别'}",
            ]
        )

    lines.extend(
        [
            "",
            "### 待人工补充",
            "",
            "- 核心业务职责边界",
            "- 对外接口清单（HTTP/RPC/事件）",
            "- 上下游依赖服务",
            SCAN_SUMMARY_END,
            "",
        ]
    )
    return "\n".join(lines)


def _upsert_scan_summary(context_file: Path, summary_block: str) -> bool:
    """插入或替换 context.md 中的自动扫描摘要块。"""
    content = _read_text(context_file)
    if not content:
        context_file.write_text("# 项目技术上下文\n\n" + summary_block, encoding="utf-8")
        return True

    if SCAN_SUMMARY_BEGIN in content and SCAN_SUMMARY_END in content:
        pattern = re.compile(
            rf"{re.escape(SCAN_SUMMARY_BEGIN)}.*?{re.escape(SCAN_SUMMARY_END)}\n?",
            flags=re.DOTALL,
        )
        updated = pattern.sub(summary_block, content)
        context_file.write_text(updated, encoding="utf-8")
        return True

    # 首次插入：追加到文件尾
    if not content.endswith("\n"):
        content += "\n"
    content += "\n" + summary_block
    context_file.write_text(content, encoding="utf-8")
    return True


def init_project_kb(
    project_path: str,
    declared_tech_stack: Optional[List[str]] = None,
    engineer_id: Optional[str] = None,
    force: bool = False,
    service_profile: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    初始化项目知识库

    Args:
        project_path: 项目目录路径
        declared_tech_stack: 配置文件中声明的技术栈
        engineer_id: 负责该项目的工程师 ID
        force: 是否强制重新初始化

    Returns:
        初始化结果
    """
    project = Path(project_path).resolve()
    kb_root = project / ".helloagents"

    # 检查项目目录是否存在
    if not project.exists():
        return {
            "success": False,
            "error": f"Project directory not found: {project_path}",
            "kb_root": str(kb_root)
        }

    kb_state = _detect_kb_state(kb_root)
    if kb_state["state"] == "complete" and not force:
        return {
            "success": True,
            "skipped": True,
            "message": "Knowledge base already exists",
            "kb_root": str(kb_root),
            "kb_state": kb_state,
        }

    # 检测技术栈
    detected = detect_tech_stack(project)
    effective_stack = list(set((declared_tech_stack or []) + detected))
    scan_result = _run_tech_scanner(project)
    modules: List[str] = []

    # 选择模板（仅保留技术栈归类，不再直接写入模板内容）
    template_name = select_template(effective_stack)

    # 创建知识库目录结构
    try:
        kb_root.mkdir(parents=True, exist_ok=True)
        (kb_root / "modules").mkdir(exist_ok=True)
        (kb_root / "api").mkdir(exist_ok=True)
        (kb_root / "plan").mkdir(exist_ok=True)
        (kb_root / "sessions").mkdir(exist_ok=True)
        (kb_root / "archive").mkdir(exist_ok=True)

        files_created = []
        context_file = kb_root / "context.md"
        guidelines_file = kb_root / "guidelines.md"
        if not context_file.exists() or force:
            context_file.write_text(
                _render_context_content(
                    project_path=project,
                    engineer_id=engineer_id,
                    declared_tech_stack=declared_tech_stack,
                    effective_stack=effective_stack,
                    scan_result=scan_result,
                    modules=modules,
                    service_profile=service_profile,
                ),
                encoding="utf-8",
            )
            files_created.append(str(context_file.relative_to(project)))
        if not guidelines_file.exists() or force:
            guidelines_file.write_text(
                _render_guidelines_content(
                    project_path=project,
                    declared_tech_stack=declared_tech_stack,
                    effective_stack=effective_stack,
                    scan_result=scan_result,
                    service_profile=service_profile,
                ),
                encoding="utf-8",
            )
            files_created.append(str(guidelines_file.relative_to(project)))

        # 创建 INDEX.md
        index_file = kb_root / "INDEX.md"
        if not index_file.exists() or force:
            index_content = f"""# {project.name} 项目知识库

> 由 HelloAGENTS 基于项目真实文件自动生成

## 项目信息

- **项目路径**: {project}
- **工程师**: {engineer_id or "未指定"}
- **技术栈**: {", ".join(effective_stack) if effective_stack else "未检测"}
- **初始化时间**: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}

## 目录结构

```
.helloagents/
├── INDEX.md          # 本文件
├── context.md        # 项目技术上下文
├── guidelines.md     # 编码规范
├── CHANGELOG.md      # 变更日志
├── modules/          # 模块文档
├── api/              # API 契约
├── plan/             # 方案包
├── sessions/         # 会话记录
└── archive/          # 归档
```

## 快速链接

- [技术上下文](context.md)
- [项目开发指南](guidelines.md)
- [变更日志](CHANGELOG.md)
- [模块索引](modules/_index.md)
"""
            index_file.write_text(index_content, encoding="utf-8")
            files_created.append(".helloagents/INDEX.md")

        # 创建 CHANGELOG.md
        changelog_file = kb_root / "CHANGELOG.md"
        if not changelog_file.exists() or force:
            changelog_content = f"""# 变更日志

## {datetime.now().strftime("%Y-%m-%d")}

### 初始化

- 由 HelloAGENTS 全栈模式初始化项目知识库
- 技术栈: {", ".join(effective_stack) if effective_stack else "未检测"}

---

<!-- 以下为自动生成的变更记录 -->
"""
            changelog_file.write_text(changelog_content, encoding="utf-8")
            files_created.append(".helloagents/CHANGELOG.md")

        # 创建 modules/_index.md
        modules_index = kb_root / "modules" / "_index.md"
        if not modules_index.exists() or force:
            modules_index.write_text("# 模块索引\n\n<!-- 自动生成 -->\n", encoding="utf-8")
            files_created.append(".helloagents/modules/_index.md")

        module_docs_created: List[str] = []

        enrichment_session = _write_enrichment_session_request(
            kb_root=kb_root,
            project_path=project,
            engineer_id=engineer_id,
            modules=modules,
            kb_state=kb_state,
        )
        files_created.append(enrichment_session)

        return {
            "success": True,
            "skipped": False,
            "kb_root": str(kb_root),
            "kb_state": kb_state,
            "template_used": template_name,
            "tech_stack": {
                "declared": declared_tech_stack or [],
                "detected": detected,
                "effective": effective_stack,
                "scanner_project_type": scan_result.get("project_type", "unknown"),
                "scanner_detected": scan_result.get("detected", {}),
            },
            "service_profile": _normalize_service_profile(service_profile),
            "modules_detected": modules,
            "module_docs_created": module_docs_created,
            "enrichment_session": {
                "required": True,
                "isolated_context": True,
                "engineer_id": engineer_id,
                "session_file": enrichment_session,
            },
            "files_created": files_created
        }

    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "kb_root": str(kb_root)
        }


def main():
    """CLI 入口"""
    if len(sys.argv) < 2:
        print("Usage: fullstack_init_project_kb.py <project_path> [options]", file=sys.stderr)
        print("Options:", file=sys.stderr)
        print("  --tech <stack1,stack2,...>  Declared tech stack", file=sys.stderr)
        print("  --engineer <id>             Engineer ID", file=sys.stderr)
        print("  --force                     Force re-initialize", file=sys.stderr)
        print("  --json                      Output as JSON", file=sys.stderr)
        sys.exit(1)

    project_path = sys.argv[1]
    tech_stack = None
    engineer_id = None
    force = False
    output_json = False
    service_profile = None

    # 解析参数
    i = 2
    while i < len(sys.argv):
        arg = sys.argv[i]
        if arg == "--tech" and i + 1 < len(sys.argv):
            tech_stack = sys.argv[i + 1].split(",")
            i += 2
        elif arg == "--engineer" and i + 1 < len(sys.argv):
            engineer_id = sys.argv[i + 1]
            i += 2
        elif arg == "--force":
            force = True
            i += 1
        elif arg == "--json":
            output_json = True
            i += 1
        elif arg == "--service-profile" and i + 1 < len(sys.argv):
            try:
                service_profile = json.loads(sys.argv[i + 1])
            except json.JSONDecodeError:
                service_profile = None
            i += 2
        else:
            i += 1

    result = init_project_kb(project_path, tech_stack, engineer_id, force, service_profile)

    if output_json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        if result["success"]:
            if result.get("skipped"):
                print(f"⏭️  知识库已存在，跳过初始化: {result['kb_root']}")
            else:
                print(f"✅ 知识库初始化成功: {result['kb_root']}")
                print(f"   模板: {result.get('template_used', 'default')}")
                print(f"   技术栈: {', '.join(result.get('tech_stack', {}).get('effective', []))}")
                if result.get("files_created"):
                    print(f"   创建文件: {len(result['files_created'])} 个")
        else:
            print(f"❌ 初始化失败: {result.get('error')}", file=sys.stderr)
            sys.exit(1)


if __name__ == "__main__":
    main()
