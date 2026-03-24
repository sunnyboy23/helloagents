#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
全栈模式项目知识库初始化器

为指定项目目录初始化 .helloagents 知识库结构，
根据技术栈选择对应的模板文件。
"""

import json
import os
import shutil
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

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


def get_template_dir() -> Path:
    """获取模板目录路径"""
    # 相对于脚本位置的模板目录
    script_dir = Path(__file__).parent
    template_dir = script_dir.parent / "templates" / "project_kb"
    return template_dir


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


def init_project_kb(
    project_path: str,
    declared_tech_stack: Optional[List[str]] = None,
    engineer_id: Optional[str] = None,
    force: bool = False
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

    # 检查知识库是否已存在
    if kb_root.exists() and not force:
        return {
            "success": True,
            "skipped": True,
            "message": "Knowledge base already exists",
            "kb_root": str(kb_root)
        }

    # 检测技术栈
    detected = detect_tech_stack(project)
    effective_stack = list(set((declared_tech_stack or []) + detected))

    # 选择模板
    template_name = select_template(effective_stack)
    template_dir = get_template_dir() / template_name

    # 如果特定模板不存在，使用默认模板
    if not template_dir.exists():
        template_dir = get_template_dir() / "default"

    # 创建知识库目录结构
    try:
        kb_root.mkdir(parents=True, exist_ok=True)
        (kb_root / "modules").mkdir(exist_ok=True)
        (kb_root / "api").mkdir(exist_ok=True)
        (kb_root / "plan").mkdir(exist_ok=True)
        (kb_root / "sessions").mkdir(exist_ok=True)
        (kb_root / "archive").mkdir(exist_ok=True)

        # 复制模板文件
        files_created = []

        if template_dir.exists():
            for template_file in template_dir.glob("*.md"):
                dest_file = kb_root / template_file.name
                if not dest_file.exists() or force:
                    content = template_file.read_text(encoding="utf-8")
                    # 替换模板变量
                    content = content.replace("{项目名称}", project.name)
                    content = content.replace("{创建时间}", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
                    content = content.replace("{工程师ID}", engineer_id or "未指定")
                    dest_file.write_text(content, encoding="utf-8")
                    files_created.append(str(dest_file.relative_to(project)))

        # 创建 INDEX.md
        index_file = kb_root / "INDEX.md"
        if not index_file.exists() or force:
            index_content = f"""# {project.name} 项目知识库

> 由 HelloAGENTS 全栈模式自动生成

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
- [编码规范](guidelines.md)
- [变更日志](CHANGELOG.md)
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
        if not modules_index.exists():
            modules_index.write_text("# 模块索引\n\n<!-- 自动生成 -->\n", encoding="utf-8")
            files_created.append(".helloagents/modules/_index.md")

        return {
            "success": True,
            "skipped": False,
            "kb_root": str(kb_root),
            "template_used": template_name,
            "tech_stack": {
                "declared": declared_tech_stack or [],
                "detected": detected,
                "effective": effective_stack
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
        else:
            i += 1

    result = init_project_kb(project_path, tech_stack, engineer_id, force)

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
