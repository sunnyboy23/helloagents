# HelloAGENTS 全栈模式最新设计说明

> 文档类型：架构与设计说明
>  
> 文档目标：基于当前仓库实现，重新梳理 HelloAGENTS 全栈模式的真实职责边界、运行时模型与跨项目编排链路
>  
> 适用范围：显式 `~fullstack` / `~fs` 流程，以及 `helloagents fullstack ...` CLI 子命令

## 1. 先说结论：今天的全栈模式到底是什么

当前 HelloAGENTS 的全栈模式，不是“把非全栈模式放大一点”，也不是旧时代那种以 Python 内核、分散状态文件和项目内配置为中心的实现。

它现在更准确的定义是：

- 一个建立在非全栈单项目引擎之上的**跨项目编排层**
- 以 `scripts/fullstack-cli.mjs` 作为统一入口
- 以 `fullstack-runtime-store.mjs` / `fullstack-config-store.mjs` 管理运行态根目录与配置
- 以 `fullstack-impact.mjs` 完成服务归属判断、影响扩散、依赖分析与派发计划生成
- 以 `fullstack-task-store.mjs` 维护任务组单状态入口 `current.json`
- 以 `fullstack-kb-init.mjs` 和 `fullstack-sync.mjs` 完成项目 KB 补齐与技术文档同步
- 以 `fullstack-gate.mjs` 保证显式全栈流程在缺少运行态证据时不能伪造“已完成”

如果用一句话概括：

> 全栈模式是 HelloAGENTS 的**多项目协作编排运行时**，负责回答“需求该落到哪些项目、谁先做、谁后做、如何派发、如何汇总状态、如何同步文档，以及什么时候真正允许收尾”。

## 2. 它解决的核心问题是什么

全栈模式针对的是单项目流程无法覆盖的跨项目协作问题。

典型场景包括：

- 一个需求同时影响前端、BFF、后端和移动端
- 同一个能力分布在多个仓库，不知道应该先改哪一个项目
- 上下游项目之间有依赖，但缺少统一的执行顺序视图
- 技术文档需要跨项目同步，否则下游无法稳定接手
- 多个项目同时推进时，状态、交付物和阻塞信息难以集中汇总

因此，全栈模式要解决的不是“项目内部怎么写代码”，而是：

- 哪些项目应参与本次需求
- 哪个项目是 owner service
- 哪些项目是受影响项目
- 各项目的先后依赖是什么
- 派发时应附带什么验证和交付契约
- 任务组推进到哪一步时才允许真正完成

## 3. 全栈模式与非全栈模式的关系

全栈模式不是替代非全栈模式，而是在其之上新增一层跨项目编排能力。

两者的职责边界可以概括为：

- **非全栈模式**：解决单项目内的规划、实现、验证、收尾
- **全栈模式**：解决跨项目的归属分析、依赖排序、派发、汇总、同步与全局收尾判断

因此正确的心智模型不是“全栈取代非全栈”，而是：

- 全栈决定**哪些项目应该参与以及如何协作**
- 各项目内部仍由各自的非全栈流程完成落地

## 4. 当前全栈模式的总体架构

从当前代码视角看，全栈模式可以拆成 6 层：

1. **统一入口层**：负责接收 `~fullstack` 和 `helloagents fullstack ...`
2. **存储与配置层**：负责 root mode、runtime/config/index 路径和 `fullstack.yaml`
3. **归属与影响分析层**：负责 owner service、影响范围、DAG 和 dispatch plan
4. **任务组运行态层**：负责 `current.json`、任务状态、artifact、verification、closeout 和 summary
5. **KB 与文档同步层**：负责项目知识库补齐、技术文档同步和 upstream 索引刷新
6. **收尾把关层**：负责在显式全栈流程中阻止缺证据完成

当前全栈模式最重要的架构变化是：

- 主实现已经统一到 Node.js/ESM
- 运行态不再依赖多份历史状态文件
- `current.json` 成为当前需求的唯一任务组入口
- 全局优先存储模型取代了项目内硬编码路径

## 5. 第一层：统一入口层

相关文件：

- `scripts/fullstack-cli.mjs`
- `scripts/notify-context.mjs`
- `scripts/notify-route.mjs`

### 5.1 `fullstack-cli.mjs` 的职责

当前全栈模式的统一 CLI 入口是 `scripts/fullstack-cli.mjs`。

它主要负责：

- 解析 `helloagents fullstack ...` 子命令
- 根据命令组分发给 runtime / config / impact / task / sync / kb / migrate 等模块
- 为不同命令统一输出 JSON 或文本结果

它不负责深度业务推理，真正的领域逻辑分别下沉到各自的 store / impact / sync 模块。

### 5.2 当前支持的命令分组

从现行实现看，统一入口已经覆盖：

- `runtime`
- `migrate`
- `init`
- `projects`
- `engineers`
- `bind`
- `unbind`
- `impact`
- `dispatch-plan`
- `cross-deps`
- `ownership`
- `create`
- `status`
- `next-layer`
- `start`
- `complete`
- `fail`
- `retry`
- `feedback`
- `report`
- `sync`
- `kb`

这说明今天的全栈模式已经不是一个“抽象概念”，而是一套可直接调用的编排 CLI。

### 5.3 `~fullstack` 在对话流里的角色

在对话执行链路中，`~fullstack` 是一个显式命令入口。

它的特点是：

- 不是语义选路默认会命中的普通路径
- 一旦进入，就应受 fullstack 运行态和收尾 gate 约束
- 只有真正完成任务组创建、派发、反馈、同步和收尾证据后，才允许报告完成

因此，全栈模式不是轻量提示功能，而是一个明确的高结构化执行路径。

## 6. 第二层：存储与配置层

相关文件：

- `scripts/fullstack-runtime-store.mjs`
- `scripts/fullstack-config-store.mjs`

### 6.1 为什么存储层是全栈模式的核心

跨项目编排天然会带来两个问题：

- 运行态写到哪里，才能避免干扰各项目工作树
- 配置与索引写到哪里，才能让多个项目复用同一套全栈上下文

因此，全栈模式当前首先解决的是“存哪”和“怎么找”的问题。

### 6.2 Root Mode：`project` 与 `global`

当前 runtime store 维护两种模式：

- `project`
- `global`

语义分别是：

- `project`：沿用项目内 `.helloagents/fullstack` 的 legacy 路径
- `global`：将全栈运行态、配置和索引提升到 `~/.helloagents/fullstack` 体系

这让团队可以逐步从项目内模式迁移到全局模式，而不需要一次性完成切换。

### 6.3 配置优先级与路径解析

当前全栈配置文件解析优先级可以概括为：

1. `HELLOAGENTS_FULLSTACK_CONFIG_FILE`
2. 若 root mode 为 `project`，直接使用 `{KB_ROOT}/fullstack/fullstack.yaml`
3. 若存在全局 config 文件或已配置全局 runtime root，则使用 `FULLSTACK_CONFIG_ROOT/fullstack.yaml`
4. 否则回退到 `{KB_ROOT}/fullstack/fullstack.yaml`

这意味着今天的全栈模式是**显式路径优先、全局优先、项目内兜底**。

### 6.4 运行态路径模型

当前全栈运行态的关键路径是：

- 全局模式：`FULLSTACK_RUNTIME_ROOT/{project_runtime_key}/fullstack/tasks/current.json`
- 项目模式：`{KB_ROOT}/fullstack/tasks/current.json`

其中 `project_runtime_key` 是由项目绝对路径稳定哈希得到的 key，用来保证多项目运行态隔离。

### 6.5 `fullstack.yaml` 的职责

当前配置文件的核心字段包括：

- `version`
- `mode`
- `engineers[]`
- `service_dependencies`
- `service_catalog`
- `orchestrator`
- `tech_doc_templates`

其中最关键的三块是：

- `engineers[]`：谁负责哪些项目
- `service_catalog`：服务边界、能力与归属线索
- `service_dependencies`：项目之间的依赖关系

这三块共同构成全栈模式的事实基础。

### 6.6 YAML fallback 的意义

当前 `fullstack-config-store.mjs` 自带 YAML fallback 解析与序列化能力。

设计目的不是“造一套 YAML 轮子”，而是保证：

- 不依赖复杂外部解析器也能稳定运行
- fullstack 配置在受限环境中仍然可读写

这属于全栈模式可靠性设计的一部分。

## 7. 第三层：归属与影响分析层

相关文件：

- `scripts/fullstack-impact.mjs`
- `scripts/fullstack-config-store.mjs`

这是全栈模式区别于非全栈模式的第一条真正核心能力链。

### 7.1 这层要回答什么问题

当用户提交一个跨项目需求时，全栈模式必须先回答：

- 哪个项目最适合作为 owner service
- 哪些项目会被这次需求影响
- 项目之间的先后依赖是什么
- 哪些项目能真正派发
- 哪些项目只是告警但暂时无法派发

### 7.2 项目画像从哪里来

当前实现会从两个来源构建项目画像：

- `fullstack.yaml` 中显式声明的描述、绑定和服务关系
- 各项目 `.helloagents/` 中的 KB 轻量推断

KB 推断会扫描：

- `context.md`
- `modules/_index.md`
- `api/upstream/_index.md`
- `INDEX.md`

然后抽取：

- summary
- capabilities
- upstream_services
- downstream_services

但这里有一个非常重要的设计原则：

> `service_catalog` 是第一事实来源，KB 推断只是低置信度补充，不能替代显式配置。

### 7.3 影响分析链条

当前分析主链可以概括为：

- `service_catalog`
- `ownership`
- `impact`
- `cross_project_dependencies`
- `dispatch_plan`

它们共同输出：

- owner service
- affected projects
- dispatchable projects
- unassigned projects
- DAG 执行顺序
- warnings

### 7.4 未绑定项目为什么不阻断

当前实现明确采用：

- 未绑定项目进入 `unassigned_projects`
- 生成 warning
- 不阻断 `dispatchable_projects` 的继续执行

这个设计非常关键，因为真实跨项目环境里，“不是所有项目都已经绑定工程师”是常态。

如果把未绑定项目当成硬阻断，整个全栈模式会失去实用性。

### 7.5 派发计划不是只有项目列表

`buildDispatchPlan()` 生成的 assignment 不只是“项目名 + 工程师”。

它还会附带 `task_contract`，其中通常包含：

- `verify_mode`
- `risk_level`
- `reviewer_focus`
- `tester_focus`
- `deliverables`
- `upstream_projects`
- `downstream_projects`
- `upstream_contracts`

这意味着全栈模式的派发从一开始就是“带合同的派发”，而不是“把一句需求扔给另一个项目”。

## 8. 第四层：任务组运行态层

相关文件：

- `scripts/fullstack-task-store.mjs`
- `scripts/fullstack-runtime-store.mjs`

这是当前全栈模式的第二条核心能力链。

### 8.1 `current.json` 是唯一当前需求入口

当前任务组状态的中心文件是：

- `current.json`

它的设计意义是：

- 全栈模式不维护多份并行历史状态
- 当前需求只保留一个单入口状态文件
- 所有进度、验证、收尾和摘要都围绕这一个入口聚合

因此今天的全栈运行时更像一个“当前需求控制面板”，而不是历史任务仓库。

### 8.2 任务组包含哪些核心结构

当前 `current.json` 的主干结构包括：

- `task_group_id`
- `requirement`
- `status`
- `execution_layers`
- `tasks`
- `progress`
- `verification`
- `closeout`
- `required_artifacts`
- `artifact_scaffold`
- `artifact_status`
- `tech_docs_synced`
- `summary`
- `global_runtime`

这说明全栈模式的状态模型不是只记录任务状态，而是把“任务、依赖、验证、交付物、摘要、运行态路径”全部集中到了一个对象里。

### 8.3 任务级与任务组级状态并存

每个任务都有自己的状态：

- `pending`
- `in_progress`
- `completed`
- `partial`
- `failed`
- `blocked`
- `skipped`

每个任务还会独立维护：

- `verification_status`
- `closeout_status`

而任务组级别又会单独聚合：

- `progress`
- `verification`
- `closeout`

所以当前运行态能清楚区分：

- 哪个任务做完了
- 哪个任务验证还没过
- 哪个任务交付物还不完整
- 任务组整体是否真的能收尾

### 8.4 `local_runtime` 与 `global_runtime`

全栈模式不仅有全局任务组状态，还会为每个任务生成项目本地运行态投影：

- inbox
- state
- events
- errors
- handoff

同时，任务组本身维护：

- `global_runtime.state_file`
- `global_runtime.event_log`
- `global_runtime.error_log`

这套双层结构的含义是：

- **全局 runtime** 负责统一汇总
- **项目本地 runtime** 负责让被派发项目可感知、可接手

### 8.5 summary 为什么重要

当前设计中，`summary` 是给恢复和人工接管准备的。

它通常会概括：

- 当前 requirement
- overall_status
- current_layer
- completed_projects
- pending_projects
- blocked_tasks
- missing_artifacts
- next_step

它不是历史档案，而是“当前需求快照”。

### 8.6 事件日志为什么重要

`fullstack-task-store.mjs` 会把关键动作写入：

- `events.ndjson`
- `errors.ndjson`

同时 `fullstack-gate.mjs` 也会用这些事件来判断：

- 是否存在任务完成/失败/阻塞的真实运行态证据

因此，事件日志不仅用于追踪，也直接影响“是否允许完成”的判断。

## 9. 第五层：artifact、verification、closeout 三条收尾子链

相关文件：

- `scripts/fullstack-task-store.mjs`
- `scripts/fullstack-gate.mjs`

### 9.1 为什么全栈模式默认要求三份必需文档

当前全栈模式默认要求的 artifact 三件套是：

- `fullstack/docs/tasks.md`
- `fullstack/docs/agents.md`
- `fullstack/docs/upstream.md`

原因不是为了多写文档，而是为了保证跨项目任务至少有三个最基本的外显面：

- 任务怎么拆
- 工程师怎么分工
- 上游依赖和同步状态怎么追踪

### 9.2 artifact 状态不是简单存在性检查

当前实现会把 artifact 状态标成：

- `missing`
- `scaffolded`
- `verified`

这意味着它不只检查“文件有没有”，还区分：

- 只是脚手架创建了
- 还是已经和任务结果建立了真实对应关系

### 9.3 verification 与 closeout 是两条不同的线

当前设计里：

- `verification` 关注“任务做完后是否已验证”
- `closeout` 关注“即使验证通过，交付物是否也准备好了”

这让系统能清楚区分三种状态：

- 代码做完了，但验证没通过
- 验证过了，但收尾资料没补齐
- 验证和收尾都满足，可以进入最终完成

### 9.4 fullstack gate 的职责

`fullstack-gate.mjs` 的作用是：

- 检查当前是否为显式 `~fullstack` 路径
- 检查 turn state 是否在尝试写 `complete`
- 如果当前缺少全栈任务组状态、缺少文档、缺少任务、缺少本地运行态或缺少事件证据，就阻止完成

这意味着显式全栈流程不能靠“自然语言说完成了”收尾，必须有真实运行态证据支撑。

## 10. 第六层：KB 自动补齐与文档同步层

相关文件：

- `scripts/fullstack-kb-init.mjs`
- `scripts/fullstack-sync.mjs`

### 10.1 KB 初始化不是深度百科生成

当前 KB 初始化的目标不是深扫整个项目、生成巨量知识文件，而是快速补齐跨项目编排所需的最低事实。

它会综合：

- 绑定时显式传入的项目描述与技术栈
- `package.json` / `pom.xml` / `go.mod` / `requirements.txt` 等结构化配置
- `README.md` / `AGENTS.md` / `CLAUDE.md` / `docs/README.md`

补齐的核心文件包括：

- `INDEX.md`
- `context.md`
- `guidelines.md`
- `CHANGELOG.md`
- `modules/_index.md`

所以它更像“可派发前的知识基线修复”，而不是“项目百科系统”。

### 10.2 KB 初始化要解决什么现实问题

全栈派发前至少要知道：

- 这个项目是干什么的
- 用什么技术栈
- 可能负责什么能力
- 是否已经有最基础的 `.helloagents/` 结构

没有这些最低事实，impact 分析和任务派发都会变得不稳定。

### 10.3 技术文档同步层做什么

`fullstack-sync.mjs` 主要做两件事：

- 把技术文档复制到目标项目的 upstream 目录
- 为同步文件加上来源、时间、文档类型等元信息

同步目录遵循：

- API 类文档 → `.helloagents/api/upstream`
- 其他文档 → `.helloagents/docs/upstream`

### 10.4 upstream 索引为什么重要

同步完成后，系统会刷新 `_index.md`。

它的作用不是装饰，而是让下游项目能快速看到：

- 现有哪些上游文档
- 文档来自哪个项目
- 最后一次同步是什么时候

这让“跨项目同步”从单次复制动作变成可追踪的知识链。

## 11. 当前全栈模式的端到端主流程

如果从一次真实需求开始，当前全栈模式更接近下面这条链路：

1. 用户显式进入 `~fullstack` 或调用 `helloagents fullstack ...`
2. 统一入口层解析 root、config、state 位置
3. 配置层读取 `fullstack.yaml` 与工程师绑定关系
4. impact 层完成 owner service 判断、影响扩散、依赖分析和 dispatch plan 生成
5. KB 初始化层按项目补齐最低 `.helloagents/` 基线
6. task store 创建任务组，写入 `current.json`
7. 按 DAG 层级派发同层项目任务
8. 各项目执行结果回流 task store，持续刷新 progress / verification / closeout / artifact_status / summary
9. sync 层同步技术文档并更新 upstream 索引
10. gate 层检查全栈运行态证据是否完备，满足条件后才允许真正完成

因此，全栈模式真正管理的是一个“跨项目任务组生命周期”，而不是一串分散命令。

## 12. 与旧设计理解相比，最大的变化是什么

如果和早期全栈模式理解相比，当前实现最重要的变化有这些：

### 12.1 从 Python 中心实现转向 Node.js/ESM 主实现

今天的全栈核心已经明确落在：

- `fullstack-cli.mjs`
- `fullstack-runtime-store.mjs`
- `fullstack-config-store.mjs`
- `fullstack-impact.mjs`
- `fullstack-task-store.mjs`
- `fullstack-kb-init.mjs`
- `fullstack-sync.mjs`

### 12.2 从分散状态文件转向单入口 `current.json`

现在的运行时主入口是一个任务组状态文件，而不是多份散落状态对象。

### 12.3 从“项目列表派发”转向“带 task contract 的派发”

现在派发时不仅决定“发给谁”，还会同时明确：

- 风险等级
- 验证模式
- reviewer / tester 关注点
- 必需交付物
- 上下游依赖约束

### 12.4 从“做完即可”转向“gate 把关后才允许完成”

当前显式全栈流程必须具备：

- 任务组状态
- 必需 artifact
- 项目本地 runtime
- 事件日志证据

否则不能宣称完成。

## 13. 推荐阅读顺序

如果你想从代码理解全栈模式，建议顺序如下：

1. 先读 `scripts/fullstack-cli.mjs`
   目标：理解统一命令入口和分组命令边界

2. 再读 `scripts/fullstack-runtime-store.mjs`
   目标：理解 root mode、config/runtime/index 路径解析和全局优先策略

3. 再读 `scripts/fullstack-config-store.mjs`
   目标：理解 `fullstack.yaml` 数据模型和工程师/服务配置

4. 再读 `scripts/fullstack-impact.mjs`
   目标：理解 ownership、impact、cross-deps、dispatch-plan 生成链

5. 再读 `scripts/fullstack-task-store.mjs`
   目标：理解任务组状态、artifact、verification、closeout、summary 和日志

6. 最后读 `scripts/fullstack-kb-init.mjs`、`scripts/fullstack-sync.mjs`、`scripts/fullstack-gate.mjs`
   目标：理解 KB 初始化、跨项目文档同步和完成态把关

## 14. 最后一段总结

今天的 HelloAGENTS 全栈模式，可以理解为：

它先通过统一 CLI 和全局优先存储模型，把跨项目需求组织成一个可追踪的任务组，再通过 impact 层判断 owner service、影响范围与派发顺序，通过 task store 把任务、依赖、验证、交付物和摘要收敛到单个 `current.json`，最后借助 KB 初始化、技术文档同步和 fullstack gate，把多项目协作从“靠人工协调”提升为“有编排、有证据、有收尾边界”的运行时。

如果只保留一句话：

> 全栈模式不是“多项目版 ~auto”，而是 HelloAGENTS 当前的跨项目编排运行时。
