#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
全栈模式技术栈扫描器

扫描项目文件，识别框架/依赖/版本，输出 detected 技术栈列表。
支持: package.json, pom.xml, build.gradle, requirements.txt, go.mod, Podfile 等
"""

import json
import os
import re
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple

# 依赖文件识别规则
DEPENDENCY_FILES = {
    # 前端项目
    "package.json": "frontend",
    # Java 项目
    "pom.xml": "java",
    "build.gradle": "java",
    "build.gradle.kts": "java",
    # Python 项目
    "requirements.txt": "python",
    "pyproject.toml": "python",
    "setup.py": "python",
    "Pipfile": "python",
    # Go 项目
    "go.mod": "go",
    # iOS 项目
    "Package.swift": "ios",
    "Podfile": "ios",
    # Android 项目
    "build.gradle.kts": "android",  # 需要检查内容
    # 鸿蒙项目
    "oh-package.json5": "harmony",
    "build-profile.json5": "harmony",
}


def scan_package_json(path: Path) -> Dict[str, str]:
    """扫描 package.json 提取依赖"""
    detected = {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)

        deps = {**data.get("dependencies", {}), **data.get("devDependencies", {})}

        # 识别主要框架
        framework_patterns = {
            "react": r"^(\d+)",
            "vue": r"^(\d+)",
            "next": r"^(\d+)",
            "nuxt": r"^(\d+)",
            "angular": r"^(\d+)",
            "svelte": r"^(\d+)",
            "nestjs": r"^(\d+)",
            "express": r"^(\d+)",
        }

        for pkg, version in deps.items():
            pkg_lower = pkg.lower().replace("@", "").replace("/", "-")

            # 框架检测
            for framework, pattern in framework_patterns.items():
                if framework in pkg_lower:
                    clean_version = re.sub(r"[^\d.]", "", version)
                    major = clean_version.split(".")[0] if clean_version else ""
                    detected[framework] = f"@{major}" if major else ""

            # TypeScript 检测
            if pkg == "typescript":
                clean_version = re.sub(r"[^\d.]", "", version)
                detected["typescript"] = f"@{clean_version.split('.')[0]}" if clean_version else ""

            # 状态管理
            if pkg in ["zustand", "redux", "pinia", "mobx", "recoil", "jotai"]:
                detected[pkg] = ""

            # 构建工具
            if pkg in ["vite", "webpack", "rollup", "esbuild", "turbopack"]:
                detected[pkg] = ""

            # UI 框架
            if pkg in ["tailwindcss", "antd", "element-plus", "@mui/material"]:
                detected[pkg.replace("@", "").replace("/", "-")] = ""

    except Exception as e:
        print(f"Warning: Failed to parse {path}: {e}", file=sys.stderr)

    return detected


def scan_pom_xml(path: Path) -> Dict[str, str]:
    """扫描 pom.xml 提取依赖"""
    detected = {}
    try:
        content = path.read_text(encoding="utf-8")

        # Spring Boot 版本
        spring_boot_match = re.search(
            r"<spring-boot.version>(\d+\.\d+)", content
        ) or re.search(r"spring-boot-starter-parent.*?(\d+\.\d+)", content)
        if spring_boot_match:
            detected["spring-boot"] = f"@{spring_boot_match.group(1)}"

        # MyBatis Plus
        if "mybatis-plus" in content:
            mybatis_match = re.search(r"mybatis-plus.*?(\d+\.\d+)", content)
            detected["mybatis-plus"] = f"@{mybatis_match.group(1)}" if mybatis_match else ""

        # MySQL
        if "mysql-connector" in content:
            detected["mysql"] = ""

        # Redis
        if "spring-boot-starter-data-redis" in content or "jedis" in content:
            detected["redis"] = ""

        # Lombok
        if "lombok" in content:
            detected["lombok"] = ""

        # MapStruct
        if "mapstruct" in content:
            detected["mapstruct"] = ""

    except Exception as e:
        print(f"Warning: Failed to parse {path}: {e}", file=sys.stderr)

    return detected


def scan_requirements_txt(path: Path) -> Dict[str, str]:
    """扫描 requirements.txt 提取依赖"""
    detected = {}
    try:
        content = path.read_text(encoding="utf-8")
        lines = content.strip().split("\n")

        framework_patterns = {
            "fastapi": "fastapi",
            "django": "django",
            "flask": "flask",
            "sqlalchemy": "sqlalchemy",
            "pydantic": "pydantic",
            "celery": "celery",
            "redis": "redis",
            "pytest": "pytest",
            "pytorch": "torch",
            "tensorflow": "tensorflow",
        }

        for line in lines:
            line = line.strip().lower()
            if not line or line.startswith("#"):
                continue

            for pattern, name in framework_patterns.items():
                if pattern in line:
                    # 提取版本号
                    version_match = re.search(r"[=<>]=?(\d+\.\d+)", line)
                    detected[name] = f"@{version_match.group(1)}" if version_match else ""

    except Exception as e:
        print(f"Warning: Failed to parse {path}: {e}", file=sys.stderr)

    return detected


def scan_go_mod(path: Path) -> Dict[str, str]:
    """扫描 go.mod 提取依赖"""
    detected = {}
    try:
        content = path.read_text(encoding="utf-8")

        # Go 版本
        go_version_match = re.search(r"^go\s+(\d+\.\d+)", content, re.MULTILINE)
        if go_version_match:
            detected["go"] = f"@{go_version_match.group(1)}"

        # 常用框架
        frameworks = {
            "github.com/gin-gonic/gin": "gin",
            "github.com/labstack/echo": "echo",
            "github.com/gofiber/fiber": "fiber",
            "gorm.io/gorm": "gorm",
            "github.com/go-redis/redis": "redis",
            "go.etcd.io/etcd": "etcd",
        }

        for pattern, name in frameworks.items():
            if pattern in content:
                version_match = re.search(rf"{re.escape(pattern)}.*?v(\d+\.\d+)", content)
                detected[name] = f"@{version_match.group(1)}" if version_match else ""

    except Exception as e:
        print(f"Warning: Failed to parse {path}: {e}", file=sys.stderr)

    return detected


def scan_podfile(path: Path) -> Dict[str, str]:
    """扫描 Podfile 提取依赖"""
    detected = {}
    try:
        content = path.read_text(encoding="utf-8")

        # Swift 版本
        swift_match = re.search(r"swift_version\s*=\s*['\"](\d+\.\d+)", content)
        if swift_match:
            detected["swift"] = f"@{swift_match.group(1)}"

        # 常用 Pod
        pods = ["Alamofire", "SnapKit", "Kingfisher", "RxSwift", "Moya"]
        for pod in pods:
            if pod.lower() in content.lower():
                detected[pod.lower()] = ""

    except Exception as e:
        print(f"Warning: Failed to parse {path}: {e}", file=sys.stderr)

    return detected


def scan_build_gradle(path: Path) -> Dict[str, str]:
    """扫描 build.gradle/build.gradle.kts 提取依赖"""
    detected = {}
    try:
        content = path.read_text(encoding="utf-8")

        # 检测是否是 Android 项目
        is_android = "com.android" in content or "android {" in content

        if is_android:
            # Kotlin 版本
            kotlin_match = re.search(r"kotlin.*?(\d+\.\d+\.\d+)", content)
            if kotlin_match:
                detected["kotlin"] = f"@{kotlin_match.group(1)}"

            # Jetpack Compose
            if "compose" in content.lower():
                detected["jetpack-compose"] = ""

            # 常用库
            if "retrofit" in content.lower():
                detected["retrofit"] = ""
            if "room" in content.lower():
                detected["room"] = ""

        else:
            # Java/Spring Boot 项目
            spring_match = re.search(r"spring-boot.*?(\d+\.\d+)", content)
            if spring_match:
                detected["spring-boot"] = f"@{spring_match.group(1)}"

    except Exception as e:
        print(f"Warning: Failed to parse {path}: {e}", file=sys.stderr)

    return detected


def scan_oh_package(path: Path) -> Dict[str, str]:
    """扫描 oh-package.json5 提取依赖（鸿蒙）"""
    detected = {"arkts": "", "arkui": ""}
    try:
        content = path.read_text(encoding="utf-8")
        # JSON5 简单解析（移除注释）
        content = re.sub(r"//.*$", "", content, flags=re.MULTILINE)
        content = re.sub(r"/\*.*?\*/", "", content, flags=re.DOTALL)

        # 尝试解析
        # 鸿蒙依赖通常在 dependencies 中
        if "@ohos" in content:
            detected["ohos"] = ""

    except Exception as e:
        print(f"Warning: Failed to parse {path}: {e}", file=sys.stderr)

    return detected


def scan_project(project_path: str) -> Dict[str, any]:
    """
    扫描项目目录，返回检测到的技术栈

    Args:
        project_path: 项目路径

    Returns:
        {
            "project_type": "frontend|java|python|go|ios|android|harmony|unknown",
            "detected": {"framework": "@version", ...}
        }
    """
    path = Path(project_path)
    if not path.exists():
        return {"error": f"Path does not exist: {project_path}"}

    detected = {}
    project_type = "unknown"

    # 扫描依赖文件
    for dep_file, file_type in DEPENDENCY_FILES.items():
        dep_path = path / dep_file
        if dep_path.exists():
            project_type = file_type

            if dep_file == "package.json":
                detected.update(scan_package_json(dep_path))
            elif dep_file == "pom.xml":
                detected.update(scan_pom_xml(dep_path))
            elif dep_file in ["build.gradle", "build.gradle.kts"]:
                detected.update(scan_build_gradle(dep_path))
            elif dep_file == "requirements.txt":
                detected.update(scan_requirements_txt(dep_path))
            elif dep_file in ["pyproject.toml", "Pipfile"]:
                # 简化处理，使用 requirements.txt 逻辑
                pass
            elif dep_file == "go.mod":
                detected.update(scan_go_mod(dep_path))
            elif dep_file in ["Package.swift", "Podfile"]:
                detected.update(scan_podfile(dep_path))
            elif dep_file == "oh-package.json5":
                detected.update(scan_oh_package(dep_path))

    # 检测配置文件
    config_files = {
        "tsconfig.json": ("typescript", ""),
        "tailwind.config.js": ("tailwindcss", ""),
        "tailwind.config.ts": ("tailwindcss", ""),
        "vite.config.ts": ("vite", ""),
        "vite.config.js": ("vite", ""),
        ".eslintrc.js": ("eslint", ""),
        ".prettierrc": ("prettier", ""),
    }

    for config_file, (tech, version) in config_files.items():
        if (path / config_file).exists():
            if tech not in detected:
                detected[tech] = version

    return {
        "project_type": project_type,
        "detected": detected,
    }


def format_tech_stack(detected: Dict[str, str]) -> List[str]:
    """格式化技术栈列表"""
    result = []
    for tech, version in detected.items():
        if version:
            result.append(f"{tech}{version}")
        else:
            result.append(tech)
    return sorted(result)


def main():
    """CLI 入口"""
    if len(sys.argv) < 2:
        print("Usage: fullstack_tech_scanner.py <project_path> [--json]", file=sys.stderr)
        sys.exit(1)

    project_path = sys.argv[1]
    output_json = "--json" in sys.argv

    result = scan_project(project_path)

    if output_json:
        print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        if "error" in result:
            print(f"Error: {result['error']}", file=sys.stderr)
            sys.exit(1)

        print(f"Project Type: {result['project_type']}")
        print(f"Detected Tech Stack:")
        for tech in format_tech_stack(result["detected"]):
            print(f"  - {tech}")


if __name__ == "__main__":
    main()
