# 全栈模式命令 (~fullstack)

> 触发词: ~fullstack, ~fs

## 命令描述

启动全栈模式，支持多项目、多工程师协同开发。主代理（Orchestrator）负责需求拆解、任务分配和进度管理。

## 闸门等级

**完整闸门**: 需求评估（评分+按需追问+EHRB） → 确认信息 → ⛔ END_TURN

## 前置条件

1. 存在 `{KB_ROOT}/fullstack/fullstack.yaml` 配置文件
2. 配置文件通过验证（version, mode, engineers 字段完整）

## 执行流程

### 1. 配置检查

```yaml
检查项:
  - fullstack.yaml 存在性
  - 配置格式验证
  - 工程师定义完整性
  - 项目路径有效性
失败处理: 输出配置问题 → 提示执行 ~fullstack init
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

### 3. 影响分析

```bash
# 调用配置解析器
python -X utf8 '{SCRIPTS_DIR}/fullstack_config.py' '{KB_ROOT}/fullstack/fullstack.yaml' impact {受影响项目列表}
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
  "role_activation": {
    "reviewer": true,
    "kb_keeper": true
  }
}
```

### 5. 项目 KB 检查

```yaml
对每个涉及的项目:
  1. 检查 {project}/.helloagents/INDEX.md 是否存在
  2. 不存在且 auto_init_kb=true → 调用初始化脚本
  3. 等待初始化完成
```

```bash
# 初始化项目知识库
python -X utf8 '{SCRIPTS_DIR}/fullstack_init_project_kb.py' '{项目路径}' --tech {技术栈} --engineer {工程师ID}
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
  1. 创建任务状态文件
  2. 按 DAG 层级派发:
     - 同层任务并行（≤6 并发）
     - 层级间串行等待
  3. 收集 ResultMessage
  4. 同步技术文档
  5. 更新任务状态
```

### 8. 结果汇总

```yaml
输出:
  - 执行结果统计
  - 变更摘要（按项目）
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
# FULLSTACK_RUNTIME_ROOT/{project_hash}/fullstack/tasks/*
```

说明:

- 若配置 `FULLSTACK_RUNTIME_ROOT`，它将作为统一的全局 fullstack 根目录：
  - 任务状态文件写入 `FULLSTACK_RUNTIME_ROOT/{project_hash}/fullstack/tasks`
  - `fullstack.yaml` 默认写入 `FULLSTACK_RUNTIME_ROOT/config/fullstack.yaml`
  - 迁移索引默认写入 `FULLSTACK_RUNTIME_ROOT/index/`
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
HELLOAGENTS_PROJECT_ROOT='{项目根目录}' HELLOAGENTS_KB_ROOT='{KB_ROOT}' python -X utf8 '{SCRIPTS_DIR}/fullstack_task_manager.py' '@auto' status
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
