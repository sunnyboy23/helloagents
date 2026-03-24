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
# 创建配置目录和模板文件
mkdir -p {KB_ROOT}/fullstack/tasks
cp {TEMPLATES_DIR}/fullstack.yaml {KB_ROOT}/fullstack/fullstack.yaml
```

### ~fullstack status

查看当前任务状态:

```bash
python -X utf8 '{SCRIPTS_DIR}/fullstack_task_manager.py' '{KB_ROOT}/fullstack/tasks/current.json' status
```

### ~fullstack projects

查看项目与工程师绑定关系:

```bash
python -X utf8 '{SCRIPTS_DIR}/fullstack_config.py' '{KB_ROOT}/fullstack/fullstack.yaml' projects
```

### ~fullstack bind

绑定项目到工程师（手动编辑配置后验证）:

```bash
python -X utf8 '{SCRIPTS_DIR}/fullstack_config.py' '{KB_ROOT}/fullstack/fullstack.yaml' validate
python -X utf8 '{SCRIPTS_DIR}/fullstack_config.py' '{KB_ROOT}/fullstack/fullstack.yaml' detect-engineer '{项目路径}'
```

### ~fullstack sync

手动触发技术文档同步:

```bash
python -X utf8 '{SCRIPTS_DIR}/fullstack_sync.py' sync '{源文档路径}' '{目标项目路径1,目标项目路径2}' --type api_contract
```

### ~fullstack unbind

解绑项目（移除绑定后验证配置）:

```bash
python -X utf8 '{SCRIPTS_DIR}/fullstack_config.py' '{KB_ROOT}/fullstack/fullstack.yaml' validate
python -X utf8 '{SCRIPTS_DIR}/fullstack_config.py' '{KB_ROOT}/fullstack/fullstack.yaml' projects
```

### ~fullstack engineers

查看工程师能力与项目分配概览:

```bash
python -X utf8 '{SCRIPTS_DIR}/fullstack_config.py' '{KB_ROOT}/fullstack/fullstack.yaml' projects
```

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
