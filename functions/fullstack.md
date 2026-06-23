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

### 3.5 配置建议预检（扩展配置自动化）

`service_catalog` 的语义字段和跨语言服务依赖无法只靠构建文件推断，过去只能人工维护。`config-suggest` 在每次影响分析前给出一份**配置建议 diff**（不直接改配置），覆盖：

- Maven/Node 构建依赖反推的 `service_dependencies`
- 配置文件/源码中的 SCF/RPC/HTTP 跨语言服务引用反推的依赖边（构建依赖扫描看不到的部分）
- 从 README/AGENTS 推断的 `service_catalog` 语义字段填充建议

```bash
# 仅产出建议 diff（默认不改配置）
helloagents fullstack config-suggest

# 审阅后一次性写入配置
helloagents fullstack config-suggest --apply
```

输出关键字段:

```yaml
dependency_additions: 建议新增的依赖边（含 project / depends_on）
dependency_evidence: 每条跨语言依赖的命中证据（来源文件 + 命中 token）
catalog_changes: 建议新增/填充的 service_catalog 字段
has_suggestions: 是否有可应用的建议
```

使用约束:

- 派发前应先跑一次 `config-suggest`；有 `dependency_additions` 时，先确认或 `--apply`，再做影响分析，避免漏算跨服务依赖
- `--apply` 只填充缺失/自动生成的字段，不覆盖用户已手写的语义字段

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

### 5.5 契约协商（让协作不再呆板）

初始 task_contract 是在任务组创建时按静态拓扑一次性算出来的，无法反映上游真实产出。为避免下游工程师按"初始假设"而非"上游最终契约"开发，task store 在上游任务完成时会自动重算下游契约：

```yaml
触发: 某下游任务的所有依赖任务都已 completed/skipped
重算来源: 上游 ResultMessage 中真实产出的 api_contract / tech_docs / changes
重算效果:
  - 把上游真实契约写入下游 task_contract.upstream_contracts
  - 上游存在接口变化时，verify_mode 升级为 integration_ready，risk_level 升为 high
  - 追加"与上游真实契约联调验证""按上游最终契约对齐"等关注点
落盘: 写 contract_renegotiated 事件 + 下游项目本地投影，contract_renegotiated_at 标记时间
```

主代理在派发下游任务前，应读取该任务的最新 task_contract（已重算），把真实上游契约作为上下文传给子代理，而不是沿用初始契约。

### 5.6 过程数据记录口径（项目本地为准）

全栈模式下每个职能工程师的过程数据**以目标项目本地为准**，不集中堆在发起对话的项目下：

```yaml
全局 runtime（FULLSTACK_RUNTIME_ROOT/{project_runtime_key}/...）:
  职责: 仅保存跨项目编排事实 —— 任务组状态 current.json、全局 events/errors 日志、summary
  不保存: 各工程师在自己项目里的实现细节

项目本地（{目标项目}/.helloagents/fullstack/...）:
  职责: 保存该工程师任务的执行事实 —— inbox / state / events / errors / handoff
  由 task store 在 create / start / complete / 契约重算时自动落盘到对应项目
  好处: 每个项目可独立恢复、独立接手，工程师子代理在自己项目内留下完整轨迹

判断依据:
  - 编排层"谁先做、谁后做、整体到哪一步" → 看全局 runtime
  - 某个项目"这个任务做了什么、验证没有、交付齐没齐" → 看该项目本地 fullstack 目录
禁止: 把所有工程师的任务、状态、交付记录只写在发起项目下
```

### 5.7 方案先行与两层评审（代码开写前必须把影响面评估清楚）

核心原则：**代码开写前，每个服务必须先输出技术方案、通过评审，才能开始编码**。这是默认开启的结构性闸门（task store 强制），不靠提示词自觉。

```yaml
方案落点（跟着归属走，不复制全量）:
  服务级方案: {服务项目}/.helloagents/docs/{feature}_technical_solution.md（事实源=该服务代码，跟各服务 repo 走）
  跨项目总览: 全局 docs 根 FULLSTACK_RUNTIME_ROOT/docs/{feature}/（无单一归属，不塞进任何参与项目）
  上游契约引用: 下游 .helloagents/api/upstream/（只读引用，靠同步而非复制全量）

方案生命周期（task store 维护，每个任务一条）:
  pending → drafted → under_review → approved | rejected
  - pending: 尚未提交方案
  - drafted: 已提交但缺必填章节（影响面/拓扑/回滚/灰度/一致性），未进入评审
  - under_review: 必填章节齐全，等待评审
  - approved: 评审通过，对应实现任务才可 start
  - rejected: 评审未通过，带 findings，作者据此修订后重新提交

闸门（默认开，可关）:
  - solution_required=true（默认）的任务，方案未 approved 时 startTask 被拒，给出原因
  - 纯文案/纯配置等无需方案的任务，创建时标 skip_solution:true 跳过
  - fullstack gate 收尾时同步校验：有未通过评审的方案不得报告完成

两层评审:
  第一层（单方案品审，独立 reviewer 子代理结合代码）:
    - 派一个独立 reviewer 子代理，要求它重读真实代码找影响面漏洞（漏调用方？漏下游？回滚是否真可行？灰度/一致性是否落地）
    - 不是复述作者方案，而是带着"找漏洞"的任务对抗式审查
    - 结论写回：helloagents fullstack solution-review {task_id} approved|rejected --findings ... --reviewer ...
  第二层（跨方案一致性，主代理）:
    - 所有服务级方案 approved 后，主代理读取 solution-consistency 汇总
    - 检查跨服务矛盾：A 改了接口响应结构，B 的方案还在用旧结构吗？各服务灰度窗口冲突吗？数据口径一致吗？
    - 单方案 reviewer 看不到别人的方案，只有主代理有全局视图，这层只能主代理做

命令:
  helloagents fullstack solution-submit {task_id} {方案文件路径}   # 提交方案（校验必填章节）
  helloagents fullstack solution-review {task_id} approved|rejected [--findings a,b] [--reviewer id]  # 第一层品审结论
  helloagents fullstack solution-status                            # 查看本任务组方案状态汇总
  helloagents fullstack solution-consistency                       # 第二层跨方案一致性输入（列出所有 approved 方案路径）
  helloagents fullstack solution-publish {方案路径} [--target feishu|none]  # 可选沉淀到飞书

方案沉淀（飞书可选，经 lark-cli 接通）:
  - 本地 md 永远是正本；配了飞书则推一份可读副本并把 doc token + 链接回填到方案头部
  - 幂等：首次 `docs +create` 创建（用 user 身份），之后 `docs +update --mode overwrite` 更新同一篇，不重复建文档
  - 创建新文档需在 doc_publish.feishu 配 folder_token 或 wiki_space；未配则报 needs_config，不伪造已发布
  - 未配飞书（target=none，默认）跳过，不阻断流程
  - `--dry-run` 只打印将执行的 lark-cli 命令，不实际发布
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
  2. 方案先行闸门（强制，编码前）:
     - 对每个 solution_required 任务，先派工程师按 technical_solution 模板结合真实代码出方案 → solution-submit
     - 派独立 reviewer 子代理结合代码品审 → solution-review（第一层）
     - 全部 approved 后，主代理读 solution-consistency 做跨方案一致性核对（第二层）
     - rejected 的方案按 findings 修订后重新提交评审；未 approved 的任务 start 会被闸门拒绝
     - 详见 5.7 方案先行与两层评审
  3. 读取派发清单（强制，防止漏派发）:
     - 调用 `helloagents fullstack dispatch-manifest`
     - manifest 列出每个任务必须派发的 expected_subagent 和交付回写路径
     - 对 manifest 中**每一个** dispatchable 任务，都必须真实调用对应职能工程师子代理，不允许主代理自行模拟实现或跳过派发
  4. 按 DAG 层级派发:
     - 同层任务并行（≤6 并发）
     - 层级间串行等待
     - 每个任务派发前调用 `start`（产生 task_started 事件，方案未 approved 会被拒），子代理完成后写 handoff 交付文件
  5. 收集 ResultMessage（包含开发、验证、交付结果），收到后调用 `feedback`
     - 上游任务完成且产出真实 API 契约时，下游任务契约会自动重算（见 3.6 契约协商）
  6. 每层完成后调用 `report`，确保 summary/current_layer/blocked_tasks 持续更新
  7. 更新任务状态（status + verification + closeout + summary）
     - `report` / `status` 必须检查 `artifact_status.missing`
     - 缺少 `fullstack/docs/tasks.md`、`agents.md`、`upstream.md` 时不得报告 fullstack 收尾完成
  8. 派发审计（强制，收尾前）:
     - 调用 `helloagents fullstack dispatch-audit`
     - `fabricated_completions` 非空表示存在"未真实派发就标记完成"的伪完成任务
     - 有伪完成任务时禁止报告 fullstack 完成，必须真实派发后补齐 start 事件与 handoff 记录
  9. 同步技术文档（可选 solution-publish 沉淀方案到飞书）
  10. 进入任务组收尾
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

# 5) 派发清单（每个任务必须真实派发对应子代理）
helloagents fullstack dispatch-manifest

# 6) 派发审计（收尾前检查是否存在伪完成）
helloagents fullstack dispatch-audit

# 7) 方案先行（编码前，强制）
helloagents fullstack solution-submit '{task_id}' '{方案文件路径}'
helloagents fullstack solution-review '{task_id}' approved|rejected --findings '...' --reviewer '{id}'
helloagents fullstack solution-status
helloagents fullstack solution-consistency

# 8) 方案沉淀（可选，飞书）
helloagents fullstack solution-publish '{方案路径}' --target feishu|none
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
