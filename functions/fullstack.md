# 全栈模式命令 (~fullstack)

> 触发词: ~fullstack, ~fs

## 命令描述

启动全栈模式，支持多项目、多工程师协同开发。主代理（Orchestrator）负责需求拆解、任务分配和进度管理。

## 闸门等级

**完整闸门**: 需求评估（评分+按需追问+EHRB） → 确认信息 → ⛔ END_TURN

## 前置条件

1. 存在 `fullstack.yaml` 配置文件（优先走 `@auto` 解析的全局配置路径，其次回退 `{KB_ROOT}/fullstack/fullstack.yaml`）
2. 配置文件通过验证（version, mode, engineers 字段完整）

## 执行流程

### 1. 配置检查

```yaml
检查项:
  - fullstack.yaml 存在性（必须先读全局 `~/.helloagents/fullstack/config/fullstack.yaml`，再按运行态配置根目录回退，最后才是 `{KB_ROOT}/fullstack/fullstack.yaml`）
  - 配置格式验证
  - 工程师定义完整性
  - 项目路径有效性
失败处理: 输出配置问题 → 提示执行 ~fullstack init
```

执行约束:

```yaml
在输出任何“fullstack 配置缺失 / 尚未进入真实全栈模式 / 无法派发”的结论前，必须完成以下预检:
  1. 实际读取 `~/.helloagents/fullstack/config/fullstack.yaml`
  2. 若上下文已提供 `FULLSTACK_RUNTIME_ROOT` / `FULLSTACK_CONFIG_ROOT`，实际读取其 `config/fullstack.yaml`
  3. 仅读取失败或不存在时，才回退 `{KB_ROOT}/fullstack/fullstack.yaml`
禁止:
  - 只检查项目内路径后就声称“没有 fullstack.yaml”
  - 未读取全局配置就判断“当前没有走真实全栈流程”
```

### 2. 需求评估

```yaml
评分维度（同 G4 通用路径）:
  需求范围: 0-3
  成果规格: 0-3
  实施条件: 0-2
  验收标准: 0-2

全栈模式附加检查:
  - 识别涉及的业务领域
  - 映射到受影响项目
  - 分析服务间依赖
```

### 2.5 服务归属分析

```yaml
适用条件:
  - 用户需求包含新增业务能力、全新接口、全新页面流程、全新领域对象、跨服务编排
  - 或 orchestrator 无法直接从现有改动点定位到唯一服务

执行顺序:
  1. 读取 fullstack.yaml 中的 `service_catalog`
  2. 优先依据用户声明的服务职责、业务范围、架构入口判断 owner service
  3. 输出:
     - owner_service
     - candidate_owner_services
     - rejected_services
     - ownership_reason
     - affected_projects_seed
  4. 仅以 `affected_projects_seed` 作为 impact 输入，不允许跳过本步骤直接做依赖扩散

阻断规则:
  - 无法收敛到唯一 owner service 时，不得直接派发开发任务
  - 若 `service_catalog` 未声明对应服务职责，只允许输出低置信度建议，不能把 AI 推断当成确定事实
  - 涉及后端接口/数据模型/跨服务依赖变化时，必须先生成 `.helloagents/docs/{feature}_technical_solution.md` 记录归属判断
```

### 3. 影响分析

```bash
# 调用 Node.js 影响分析器（统一走 fullstack CLI，兼容全局 fullstack 根目录与 legacy 项目内路径）
helloagents fullstack impact '{受影响项目路径1}' '{受影响项目路径2}'
```

输出:
- directly_affected: 直接受影响的项目
- all_affected: 所有受影响的项目（含级联）
- execution_order: 拓扑排序后的执行层级
- dispatch_plan.dispatchable_projects: 已绑定工程师、可派发的项目
- dispatch_plan.unassigned_projects: 未绑定工程师的项目（仅告警并跳过，不阻断）
- dispatch_plan.grouped_by_engineer_type: 按职能工程师类型分组的可派发项目
- dispatch_plan.continue_execution: 是否继续执行（有可派发项目即 true）
- dispatch_plan.warnings: 非阻断告警（含补绑建议）

### ~fullstack dispatch-plan

按“当前已绑定的工程师与项目”生成派发计划（仅派发给存在的职能工程师）:

```bash
~fullstack dispatch-plan '{受影响项目路径1}' '{受影响项目路径2}'
```

输出:

```yaml
dispatchable_projects: 可派发项目（有绑定工程师）
unassigned_projects: 未绑定项目（不派发，仅提示补绑定，非阻断）
grouped_by_engineer_type: 可派发项目按职能类型分组
dispatch_execution_order: 仅对可派发项目做 DAG 层级
continue_execution: 有可派发项目时继续执行
warnings: 非阻断告警与补绑建议
```

### 4. 任务拆解

为每个受影响项目创建 TaskMessage:

```json
{
  "task_id": "T{N}",
  "task_group_id": "{YYYYMMDD}-{功能名称}",
  "engineer_id": "{工程师ID}",
  "project": "{项目路径}",
  "description": "{任务描述}",
  "depends_on": ["{依赖任务ID}"],
  "context": {
    "requirement": "{原始需求}",
    "api_contracts": ["{上游API契约路径}"]
  },
  "task_contract": {
    "verify_mode": "standard | cross_project | api_contract_required | integration_ready",
    "risk_level": "medium | high",
    "reviewer_focus": ["依赖影响是否完整", "接口/文档是否同步"],
    "tester_focus": ["关键路径可验证", "上下游联调风险已覆盖"],
    "deliverables": ["代码变更摘要", "验证结果摘要"],
    "upstream_projects": ["{上游项目路径}"],
    "downstream_projects": ["{下游项目路径}"],
    "upstream_contracts": ["{上游契约目录}"]
  },
  "role_activation": {
    "reviewer": true,
    "kb_keeper": true
  }
}
```

全栈模式强制交付物（创建任务组前后立即落盘并校验）:

- `STATE.md`: 项目级恢复快照
- `fullstack/tasks/current.json`: 运行态状态文档
- `fullstack/docs/tasks.md`: 人类可读任务文档
- `fullstack/docs/agents.md`: 子职能分工文档
- `fullstack/docs/upstream.md`: upstream 索引文档
- `.helloagents/docs/{feature}_technical_solution.md`: 涉及后端接口/数据模型/跨服务依赖时必须补齐

任务契约补充要求:

- `task_contract.required_artifacts` 必须列出该任务必须回传的文档/产物
- orchestrator 在 `tasks_json` 中至少要写入上述三份 fullstack docs 作为任务组级 `required_artifacts`
- 若缺少 required artifacts，任务状态可以 completed，但 `closeout_status` 必须保持 `needs_attention`
- `create task group` 前必须生成文档骨架，缺少以下任一文件不得进入任务派发:
  - `fullstack/docs/tasks.md`
  - `fullstack/docs/agents.md`
  - `fullstack/docs/upstream.md`
- 涉及后端接口/数据模型/跨服务依赖时，还必须生成 `.helloagents/docs/{feature}_technical_solution.md`

### 5. 项目 KB 检查

```yaml
对每个涉及的项目:
  1. 检查 {project}/.helloagents/INDEX.md 是否存在
  2. 不存在且 auto_init_kb=true → 调用初始化脚本
  3. 初始化优先消费 fullstack.yaml 中的 `service_catalog`
  4. 仅补充轻量事实（包管理器、主要依赖、已有 README/AGENTS 摘要、少量关键入口）
  5. 禁止通过深度递归扫描整个仓库来生成项目 KB
  6. 等待初始化完成
```

```bash
# 初始化项目知识库
helloagents fullstack kb init '{项目路径}'
```

### 6. 确认信息

```yaml
输出: G3 确认格式
  📋 需求: {需求摘要}
  📊 评分: N/10
  📊 影响分析:
    - 涉及项目: {N} 个
    - 涉及工程师: {M} 位
    - 任务总数: {K} 个
  📦 执行计划:
    Layer 1: ...
    Layer 2: ...
  选项:
    1. 全自动执行（推荐）
    2. 交互式执行
    3. 改需求后再执行

→ ⛔ END_TURN
```

### 7. 并发派发（用户确认后）

```yaml
设置:
  WORKFLOW_MODE: DELEGATED（选1）| INTERACTIVE（选2）
  CURRENT_STAGE: DEVELOP

执行:
  1. 先落盘任务组运行时状态（强制）
     - 将 task_group_id / requirement / tasks[] / required_artifacts 写入临时 tasks_json
     - 调用 `helloagents fullstack create {tasks_json}`
     - 成功后立即调用 `status` / `report` 校验:
       - current.json 已生成
       - fullstack/docs/tasks.md 已存在
       - fullstack/docs/agents.md 已存在
       - fullstack/docs/upstream.md 已存在
  2. 按 DAG 层级派发:
     - 同层任务并行（≤6 并发）
     - 层级间串行等待
  3. 收集 ResultMessage（包含开发、验证、交付结果）
  4. 每个任务开始前调用 `start`，收到 ResultMessage 后调用 `feedback`
  5. 每层完成后调用 `report`，确保 summary/current_layer/blocked_tasks 持续更新
  6. 更新任务状态（status + verification + closeout + summary）
     - `report` / `status` 必须检查 `artifact_status.missing`
     - 缺少 `fullstack/docs/tasks.md`、`agents.md`、`upstream.md` 时不得报告 fullstack 收尾完成
  7. 同步技术文档
  8. 进入任务组收尾
```

运行态命令约束：

```bash
# 1) 创建任务组状态（必调）
helloagents fullstack create '{tasks_json}'

# 2) 任务开始
helloagents fullstack start '{task_id}'

# 3) 工程师反馈
helloagents fullstack feedback '{task_id}' '{status}' '{result_json}'

# 4) 实时报告
helloagents fullstack report
```

说明：

- `@auto` 必须作为全栈运行态唯一推荐入口，禁止再写死 `'{KB_ROOT}/fullstack/tasks/current.json'`
- 若已配置 `FULLSTACK_RUNTIME_ROOT`，运行时状态必须落到 `FULLSTACK_RUNTIME_ROOT/{project_runtime_key}/fullstack/tasks/current.json`
- 未配置时，才允许回退到项目内 `{KB_ROOT}/fullstack/tasks/current.json`
- fullstack 运行态只保留当前需求状态，`current.json` 是唯一运行态入口，不在 runtime 目录保存历史需求快照

### 8. 结果汇总

```yaml
输出:
  - 执行结果统计
  - 必需产物状态（artifact_status.present / missing）
  - 变更摘要（按项目）
  - 验证状态汇总（passed / pending / needs_attention）
  - 收尾状态汇总（ready / pending / needs_attention）
  - 当前摘要（current_layer / blocked_tasks / next_step）
  - 技术文档同步情况
  - 问题和注意事项
```

## 子命令

### ~fullstack init

初始化全栈模式配置:

```bash
# 未设置全局根目录时，创建 legacy 项目内目录与模板文件
mkdir -p {KB_ROOT}/fullstack/tasks
cp {TEMPLATES_DIR}/fullstack.yaml {KB_ROOT}/fullstack/fullstack.yaml

# 已设置 ~fullstack runtime set-root 时，默认改为使用统一全局根目录
# FULLSTACK_RUNTIME_ROOT/config/fullstack.yaml
# FULLSTACK_RUNTIME_ROOT/index/*
# FULLSTACK_RUNTIME_ROOT/{project_runtime_key}/fullstack/tasks/*
```

说明:

- 若配置 `FULLSTACK_RUNTIME_ROOT`，它将作为统一的全局 fullstack 根目录：
  - 任务状态文件写入 `FULLSTACK_RUNTIME_ROOT/{project_runtime_key}/fullstack/tasks`
  - `fullstack.yaml` 默认写入 `FULLSTACK_RUNTIME_ROOT/config/fullstack.yaml`
  - 迁移索引默认写入 `FULLSTACK_RUNTIME_ROOT/index/`
- `project_runtime_key` 来源于 `project_root` 绝对路径的稳定 hash，用于隔离项目级运行态；它不是项目名，也不是需求名
- 未配置时，继续使用 legacy 项目内路径
- 可在 `init` 前通过命令设置运行态根目录：

```bash
~fullstack runtime set-root '~/.helloagents/runtime'
~fullstack runtime get-root
```

### ~fullstack status

查看当前任务状态:

```bash
~fullstack status
```

可选环境变量（覆盖默认 cwd 推断）:

```bash
HELLOAGENTS_PROJECT_ROOT='{项目根目录}' HELLOAGENTS_KB_ROOT='{KB_ROOT}' helloagents fullstack status
```

### ~fullstack projects

查看项目与工程师绑定关系:

```bash
~fullstack projects
```

### ~fullstack bind

绑定项目到工程师（支持绝对路径和跨目录项目）:

```bash
~fullstack bind '{项目绝对路径}' --engineer-id '{工程师ID}' --allow-rebind
```

### ~fullstack sync

手动触发技术文档同步:

```bash
~fullstack sync '{源文档路径}' '{目标项目路径1,目标项目路径2}' --type api_contract
```

### ~fullstack unbind

解绑项目（移除绑定并保存配置）:

```bash
~fullstack unbind '{项目绝对路径}'
```

### ~fullstack engineers

查看工程师能力与项目分配概览:

```bash
~fullstack engineers
```

### ~fullstack bind wizard

向导式绑定（推荐首次使用）:

```bash
~fullstack bind wizard
```

交互流程:

```yaml
1. 选择工程师类型（backend-java / frontend-react 等）
2. 输入工程师ID（可自动生成）
3. 输入多个项目绝对路径（逐行输入，空行结束）
4. 选择是否允许重绑定迁移（--allow-rebind）
5. 确认后写入 fullstack.yaml
```

### ~fullstack kb init --all

批量初始化所有已绑定项目 KB:

```bash
~fullstack kb init --all
```

行为补充:

- 若项目不存在 `.helloagents/`，创建项目 KB 骨架并注入自动扫描摘要
- 若项目已存在 `.helloagents/` 但只有 `plan/archive/CHANGELOG` 等历史记录、缺少项目级文档，则保留历史记录并补齐核心知识文档
- 会为每个项目生成一个面向对应工程师的独立会话补全文档任务，避免多个项目共用同一上下文

### ~fullstack runtime set-root/get-root/clear-root

在聊天命令中设置/查看/清理统一的全局 fullstack 根目录（支持在 `~fullstack init` 前执行）:

```bash
~fullstack runtime choose-root
~fullstack runtime set-root '~/.helloagents/runtime'
~fullstack runtime get-root
~fullstack runtime clear-root
```

说明:

- `choose-root`：首次初始化前先选择 `fullstack` 文件夹放在项目内还是用户目录，并将选择写入全局配置
- 选择 `global` 后，再通过 `set-root` 可进一步指定具体用户目录路径

### ~fullstack resume

恢复中断的任务执行:

```yaml
1. 读取任务状态文件
2. 找到未完成的层级
3. 继续派发任务
```

## 工程师子代理调用

| 工程师类型 | 子代理 |
|-----------|--------|
| backend-java | ha-backend-java |
| backend-python | ha-backend-python |
| backend-go | ha-backend-go |
| backend-nodejs | ha-backend-nodejs |
| frontend-react | ha-frontend-react |
| frontend-vue | ha-frontend-vue |
| mobile-ios | ha-mobile-ios |
| mobile-android | ha-mobile-android |
| mobile-harmony | ha-mobile-harmony |

调用示例（Claude Code）:

```
Task(
  subagent_type="ha-backend-java",
  prompt="[跳过指令] 直接执行以下任务，跳过路由评分。
    使用 zh-CN 输出。
    任务ID: T1
    项目: ./backend/user-service
    描述: 实现用户积分查询和扣减接口
    上下文: {完整上下文}
    返回: ResultMessage JSON 格式"
)
```

## 输出格式

### 主体内容要素

**派发确认场景:**
- 📋 需求: {需求摘要}
- 📊 评分: {评分详情}
- 📊 影响分析: {项目数、工程师数、任务数}
- 📦 执行计划: {分层任务列表}
- 选项: {执行模式选择}

**执行中场景:**
- 📊 进度: {完成数}/{总数} ({百分比}%)
- 任务状态列表
- 📄 已同步文档

**完成场景:**
- 📊 执行结果
- 📁 变更摘要
- 📄 技术文档
- ⚠️ 注意事项（如有）

## 状态图标

| 状态 | 图标 |
|------|------|
| 待执行 | [ ] |
| 执行中 | [→] |
| 已完成 | [√] |
| 失败 | [X] |
| 已跳过 | [-] |
| 已阻塞 | [!] |

## 错误处理

| 错误类型 | 处理方式 |
|----------|----------|
| 配置文件不存在 | 提示执行 ~fullstack init |
| 配置验证失败 | 输出具体错误，提示修复 |
| 项目路径无效 | 列出无效路径，提示修正 |
| 单任务失败 | 标记失败，继续执行无依赖任务 |
| 依赖任务失败 | 下游任务标记 blocked |
| 网络/超时错误 | 自动重试 1 次 |
