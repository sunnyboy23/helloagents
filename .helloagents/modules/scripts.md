# scripts

## 职责

提供 CLI 辅助脚本（创建/校验方案包、升级知识库、扫描项目统计等），作为工具层能力。

## 接口定义（可选）

### 公共API
| 脚本 | 说明 |
|------|------|
| create_package.py | 创建方案包目录与模板 |
| validate_package.py | 校验方案包结构 |
| migrate_package.py | 迁移方案包至 archive |
| upgrade_wiki.py | 初始化/升级知识库 |
| project_stats.py | 扫描项目统计 |
| fullstack_runtime.py | 解析全栈全局根目录、配置目录、索引目录与运行态任务目录 |
| fullstack_migrate.py | 在 legacy 项目内 fullstack 路径与全局 fullstack 路径之间迁移数据 |

## 行为规范

### 脚本调用
**条件**: 规则/阶段触发
**行为**: 使用 python -X utf8 运行并解析 JSON 输出
**结果**: 主流程基于执行报告继续或降级处理

### 全栈路径解析
**条件**: `~fullstack` 运行态/配置解析与迁移场景
**行为**: 优先读取显式配置；当设置 `FULLSTACK_RUNTIME_ROOT` 时，将其视为统一的全局 fullstack 根目录，并默认派生 `config/`、`index/` 与按项目隔离的 `tasks/`
**结果**: `init`、任务状态管理与迁移脚本使用一致的全局路径语义

### 项目 KB 初始化
**条件**: `~fullstack kb init --all` 或 `ensure-kb/ensure-kb-all`
**行为**: 识别缺失或半成品项目知识库，保留原有 plan/archive/CHANGELOG 等历史文件，补齐核心项目文档与模块文档，并为对应工程师生成独立会话补全文档任务
**结果**: 每个项目都有可继续完善的项目级知识文档，后续由对应工程师在独立上下文中整理

## 依赖关系

```yaml
依赖: [templates]
被依赖: [stages, services]
```
