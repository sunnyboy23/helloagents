# 变更日志

## [Unreleased]

### 新增
- **[fullstack-share]**: 参考完整说明文档深化全栈模式分享演示稿，在保持流程主线不变的前提下补充关键脚本职责、函数映射和代码阅读路径，升级为“流程 + 实现”双视角分享 — by wangdongcheng
  - 方案: [202604141406_fullstack-share-detail-refresh](archive/2026-04/202604141406_fullstack-share-detail-refresh/)
  - 决策: fullstack-share-detail-refresh#D001(保持流程主线不变，按源码映射层增强关键页面)
- **[fullstack-share]**: 重构全栈模式分享演示稿，改为机制拆解型技术分享，重写视觉系统、页级叙事、讲稿与提纲，并移除案例页聚焦系统机制 — by wangdongcheng
  - 方案: [202604132037_fullstack-share-redesign](archive/2026-04/202604132037_fullstack-share-redesign/)
  - 决策: fullstack-share-redesign#D001(采用机制拆解型结构替换介绍型叙事)

### 快速修改
- **[fullstack-share-ppt]**: 重写全栈模式分享演示稿，改为“以 fullstack 为主、非全栈为参照”的对比增强版，补充关键能力代码摘录与 X-Ray 实践案例，并同步更新提纲/讲稿/说明文件 `[类型: 文档+前端]` — by Codex
  - 文件: `docs/fullstack-mode-share/app.js`, `docs/fullstack-mode-share/styles.css`, `docs/fullstack-mode-share/outline.md`, `docs/fullstack-mode-share/speaker-notes.md`, `docs/fullstack-mode-share/README.md`
- **[gitignore]**: 更新 `.gitignore`，新增 `docs/` 与 `tests/` 目录忽略规则，避免本地文档与测试目录默认进入待提交列表 `[类型: 配置]` — by Codex
  - 文件: `.gitignore`
- **[fullstack-share-ppt]**: 收紧全栈模式分享 PPT 的单页版式约束，并将主体展示区改为顶部对齐，避免内容区域整体偏下且需要上下滚动 `[类型: 样式]` — by Codex
  - 文件: `docs/fullstack-mode-share/styles.css`
- **[project-kb-facts]**: 重构项目知识库生成逻辑，改为以 README/AGENTS/构建配置/目录结构等真实仓库事实驱动生成 `context.md` 与 `guidelines.md`，减少模板虚构内容，并补强 Java 多模块与前端样式体系识别 `[类型: 脚本+测试]` — by Codex
  - 文件: `helloagents/scripts/fullstack_init_project_kb.py`, `tests/test_fullstack_init_project_kb.py`
- **[fullstack-init-bridge]**: 打通真实 `helloagents fullstack init/bind/kb init --all` 命令桥接，并修正 `project` 模式下仍误取全局 `fullstack.yaml` 的优先级问题，确保初始化位置严格遵循根目录选择 `[类型: 脚本+测试]` — by Codex
  - 文件: `helloagents/core/fullstack_runtime_cmd.py`, `helloagents/scripts/fullstack_runtime.py`, `helloagents/scripts/fullstack_config.py`, `tests/test_fullstack_runtime.py`
- **[fullstack-root-choice]**: 为全栈 `fullstack` 文件夹新增首次位置选择与持久化模式（项目内 / 用户目录），避免初始化时默认落到当前项目目录 `[类型: 脚本+文档]` — by wangdongcheng
  - 文件: `helloagents/scripts/fullstack_runtime.py`, `helloagents/core/fullstack_runtime_cmd.py`, `helloagents/core/dispatcher.py`, `helloagents/_common.py`, `helloagents/scripts/_config.py`, `tests/test_fullstack_runtime.py`, `docs/fullstack-mode-guide.md`, `helloagents/functions/fullstack.md`, `README.md`, `README_CN.md`, `AGENTS.md`
- **[fullstack-kb]**: 增强 `~fullstack kb init --all`，支持修复半成品项目 KB、保留原有任务与归档记录，并为每个项目生成工程师独立会话的补全文档任务 `[类型: 脚本+文档]` — by wangdongcheng
  - 文件: `helloagents/scripts/fullstack_init_project_kb.py`, `helloagents/scripts/fullstack_config.py`, `tests/test_fullstack_init_project_kb.py`, `helloagents/functions/fullstack.md`, `docs/fullstack-mode-guide.md`, `docs/fullstack-mode-design.md`, `docs/helloagents-message-flow-code-level.md`, `.helloagents/modules/scripts.md`
- **[fullstack-runtime]**: 统一 `FULLSTACK_RUNTIME_ROOT` 语义，设置后默认同步派生全局配置目录与索引目录，避免 `~fullstack init` 与运行态路径分离 `[类型: 脚本+文档]` — by wangdongcheng
  - 文件: `helloagents/scripts/fullstack_runtime.py`, `helloagents/core/fullstack_runtime_cmd.py`, `helloagents/_common.py`, `helloagents/scripts/_config.py`, `tests/test_fullstack_runtime.py`, `helloagents/functions/fullstack.md`, `docs/fullstack-mode-guide.md`, `docs/fullstack-mode-design.md`, `docs/helloagents-message-flow-code-level.md`, `README.md`, `README_CN.md`, `AGENTS.md`
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
- **[xray-fullstack-plan]**: 输出雅典娜 / 质检大脑 / athenaweb 的 X-ray 跨项目技术方案与任务拆分，覆盖多质检码输入、历史拍照、漏检提交、风险商户+风险机型+购买渠道推送规则 `[类型: 方案包]` — by Codex
  - 方案: [202604151530_xray-fullstack-plan](plan/202604151530_xray-fullstack-plan/)
- **[knowledge-base]**: 初始化项目知识库与模块文档基线 — by wangdongcheng
  - 方案: [202603201905_kb-bootstrap](archive/2026-03/202603201905_kb-bootstrap/)
  - 决策: kb-bootstrap#D001(模块按仓库结构划分)
