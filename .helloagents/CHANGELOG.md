# 变更日志

## [Unreleased]

### 快速修改
- **[fullstack-agent]**: 补齐 Go/Node.js/Vue 工程师角色与 Agent 映射，修正 Node.js 命名一致性（新增 backend_go.md、backend_nodejs.md、frontend_vue.md、ha-backend-go.md、ha-backend-nodejs.md；更新 orchestrator/fullstack 映射与任务进度） `[类型: 文档+规则]`
  - 文件: `helloagents/rlm/roles/backend_go.md`, `helloagents/rlm/roles/backend_nodejs.md`, `helloagents/rlm/roles/frontend_vue.md`, `helloagents/agents/ha-backend-go.md`, `helloagents/agents/ha-backend-nodejs.md`, `helloagents/agents/ha-orchestrator.md`, `helloagents/functions/fullstack.md`, `.helloagents/plan/202603241500_fullstack-mode/tasks.md`
- **[fullstack-agent]**: 清理重复 Node.js Agent 文件，移除历史命名 `ha-backend-node.md`，统一使用 `ha-backend-nodejs.md` `[类型: 文档+规则]`
  - 文件: `helloagents/agents/ha-backend-node.md`
- **[fullstack-layer6]**: 完成 Layer 6 核心能力（任务反馈驱动状态管理、项目KB自动检查初始化、工程师能力自动识别、跨项目依赖分析）并增强无 PyYAML 环境下的 YAML 解析降级能力 `[类型: 规则+脚本]`
  - 文件: `helloagents/scripts/fullstack_task_manager.py`, `helloagents/scripts/fullstack_config.py`, `helloagents/agents/ha-orchestrator.md`, `helloagents/rlm/roles/orchestrator.md`, `.helloagents/plan/202603241500_fullstack-mode/tasks.md`
- **[fullstack-reconcile]**: 完成任务状态对账并补齐兼容脚本与模板资产（新增 fullstack_deps.py/fullstack_state.py、扩展 project_kb 技术栈模板、补全 ~fullstack 子命令说明、同步 AGENTS G7/G9 与安装器全栈代理覆盖校验） `[类型: 脚本+文档]`
  - 文件: `helloagents/scripts/fullstack_deps.py`, `helloagents/scripts/fullstack_state.py`, `helloagents/templates/project_kb/`, `helloagents/functions/fullstack.md`, `AGENTS.md`, `helloagents/installer.py`, `.helloagents/plan/202603241500_fullstack-mode/tasks.md`
- **[fullstack-docs]**: 完成剩余拓扑文档项，补充 README_CN 全栈模式入口与独立使用指南 `[类型: 文档]`
  - 文件: `README_CN.md`, `docs/fullstack-mode-guide.md`, `.helloagents/plan/202603241500_fullstack-mode/tasks.md`
- **[fullstack-acceptance]**: 完成全栈模式验收清单收尾（技术栈识别、多项目依赖调度、任务反馈触发、跨项目文档同步、角色继承与输出字段、命令与文档完整性） `[类型: 验收]`
  - 文件: `.helloagents/plan/202603241500_fullstack-mode/tasks.md`

## [2.3.0] - 2026-03-20

### 新增
- **[knowledge-base]**: 初始化项目知识库与模块文档基线 — by wangdongcheng
  - 方案: [202603201905_kb-bootstrap](archive/2026-03/202603201905_kb-bootstrap/)
  - 决策: kb-bootstrap#D001(模块按仓库结构划分)
