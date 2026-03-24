# 全栈模式 (Fullstack Mode) 方案设计

> 方案类型: implementation
> 创建时间: 2026-03-24
> 状态: draft

---

## 1. 背景与目标

### 1.1 背景

HelloAGENTS 当前提供了强大的子代理编排能力（RLM），但主要面向单一项目或模块的任务。在全栈开发场景中，一个需求往往涉及多个技术栈（前端、后端、移动端），需要不同专业背景的工程师协作完成。

### 1.2 目标

在保持 HelloAGENTS 现有所有能力的基础上，新增"全栈模式"，实现：

1. **项目-工程师绑定**: 通过项目路径指定由哪种工程师负责
2. **主代理协调**: 总览 Agent 负责任务拆解、分配、协调和**任务状态管理**
3. **专业化子代理**: 为不同技术栈创建专业化的工程师 Agent
4. **角色叠加**: 工程师角色 **继承 HelloAGENTS 通用角色能力**（reviewer/kb_keeper 等）
5. **并发执行**: 任务派发后，无依赖的工程师 **并发执行**
6. **单向通信**: 子代理之间不共享记忆，只接收主代理消息
7. **技术文档同步**: 后端工程师输出的技术文档可同步给其他工程师
8. **任务状态实时更新**: 主代理根据工程师反馈 **实时更新任务状态**

---

## 2. 整体架构

### 2.1 架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                        全栈模式架构                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌───────────────────────────────────────────────────────────┐       │
│  │                  主代理 (ha-orchestrator)                   │       │
│  │                                                             │       │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │       │
│  │  │ 需求分析器   │  │ 任务调度器   │  │ 文档同步器   │        │       │
│  │  └─────────────┘  └─────────────┘  └─────────────┘        │       │
│  │                                                             │       │
│  │  ┌─────────────┐  ┌─────────────────────────────┐         │       │
│  │  │ 并发调度器   │  │   任务状态管理器              │         │       │
│  │  │ (DAG拓扑)   │  │   (实时更新+反馈处理)         │         │       │
│  │  └─────────────┘  └─────────────────────────────┘         │       │
│  │                                                             │       │
│  └───────────────────────────────────────────────────────────┘       │
│                              │                                        │
│          ┌──────────────────┼──────────────────┐                     │
│          │ 并发派发          │ 并发派发          │ 并发派发            │
│          ▼                  ▼                  ▼                     │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐        │
│  │   前端工程师组    │ │   移动端工程师组  │ │   后端工程师组    │        │
│  │ ┌─────────────┐ │ │ ┌─────────────┐ │ │ ┌─────────────┐ │        │
│  │ │ 职能角色     │ │ │ │ 职能角色     │ │ │ │ 职能角色     │ │        │
│  │ │ + 通用角色   │ │ │ │ + 通用角色   │ │ │ │ + 通用角色   │ │        │
│  │ │ (reviewer   │ │ │ │ (reviewer   │ │ │ │ (reviewer   │ │        │
│  │ │  kb_keeper) │ │ │ │  kb_keeper) │ │ │ │  kb_keeper) │ │        │
│  │ └─────────────┘ │ │ └─────────────┘ │ │ └─────────────┘ │        │
│  │ ┌─────┐ ┌─────┐│ │┌─────┐ ┌─────┐ │ │┌─────┐ ┌─────┐ │        │
│  │ │ Vue │ │React││ ││ iOS │ │ And ││ ││Java │ │ Py  │ │        │
│  │ └─────┘ └─────┘│ │└─────┘ └─────┘ │ │└─────┘ └─────┘ │        │
│  │                 │ │       ┌─────┐ │ │┌─────┐ ┌─────┐ │        │
│  │        反馈 ↑   │ │反馈 ↑ │Harm │ │ ││ Go  │ │Node │ │        │
│  │                 │ │       └─────┘ │ │└─────┘ └─────┘ │        │
│  └────────┬────────┘ └───────┬───────┘ └───────┬────────┘        │
│           │                  │                  │                 │
│           └──────────────────┼──────────────────┘                 │
│                              ▼                                    │
│                    ┌─────────────────┐                            │
│                    │ 任务状态存储      │                            │
│                    │ (tasks.json)    │                            │
│                    └─────────────────┘                            │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 核心组件

| 组件 | 职责 | 位置 |
|------|------|------|
| 主代理 (ha-orchestrator) | 需求分析、任务拆解、工程师调度、文档同步、**任务状态管理** | `agents/ha-orchestrator.md` |
| **并发调度器** | DAG 拓扑排序、同层任务并发派发、依赖检测 | 主代理内置 |
| **任务状态管理器** | 接收工程师反馈、实时更新任务状态、触发下游任务 | 主代理内置 |
| 前端工程师 | Vue/React 专业开发 + **通用角色能力** | `agents/ha-frontend-*.md` |
| 移动端工程师 | iOS/Android/鸿蒙专业开发 + **通用角色能力** | `agents/ha-mobile-*.md` |
| 后端工程师 | Java/Python/Go/Node.js 专业开发 + **通用角色能力** | `agents/ha-backend-*.md` |
| 配置管理器 | 解析 fullstack.yaml | `services/fullstack.md` |
| 文档同步器 | 技术文档在工程师间同步 | `services/fullstack.md` |

---

## 3. 详细设计

### 3.1 配置文件设计

**文件路径**: `.helloagents/fullstack.yaml`（全局配置，位于 monorepo 根目录）

```yaml
# 全栈模式配置
version: "1.0"
mode: fullstack

# 工程师定义（按职能+技术栈）
engineers:
  # 前端工程师
  - id: fe-react-main
    type: frontend-react
    name: "React 前端工程师"
    projects:
      - path: "./frontend/web-app"
        description: "React 用户端应用"
        auto_init_kb: true  # 自动初始化项目知识库
      - path: "./frontend/h5"
        description: "React H5 页面"
        auto_init_kb: true

  - id: fe-vue-admin
    type: frontend-vue
    name: "Vue 前端工程师"
    projects:
      - path: "./frontend/admin"
        description: "Vue 后台管理系统"
        auto_init_kb: true

  # 后端工程师（多服务架构）
  - id: be-java-core
    type: backend-java
    name: "Java 核心服务工程师"
    projects:
      - path: "./backend/user-service"
        description: "用户服务"
        tech_stack: [spring-boot@3, mybatis-plus, mysql]
        auto_init_kb: true
      - path: "./backend/order-service"
        description: "订单服务"
        tech_stack: [spring-boot@3, mybatis-plus, mysql]
        auto_init_kb: true
      - path: "./backend/payment-service"
        description: "支付服务"
        tech_stack: [spring-boot@3, mybatis-plus, mysql]
        auto_init_kb: true

  - id: be-python-data
    type: backend-python
    name: "Python 数据服务工程师"
    projects:
      - path: "./backend/data-service"
        description: "数据处理服务"
        tech_stack: [fastapi, sqlalchemy, postgresql]
        auto_init_kb: true
      - path: "./backend/ml-service"
        description: "机器学习服务"
        tech_stack: [fastapi, pytorch, redis]
        auto_init_kb: true

  - id: be-go-gateway
    type: backend-go
    name: "Go 网关工程师"
    projects:
      - path: "./backend/api-gateway"
        description: "API 网关"
        tech_stack: [gin, redis, etcd]
        auto_init_kb: true

  - id: be-node-bff
    type: backend-nodejs
    name: "Node.js BFF 工程师"
    projects:
      - path: "./backend/bff"
        description: "BFF 层"
        tech_stack: [nestjs, graphql, typescript]
        auto_init_kb: true

  # 移动端工程师
  - id: mobile-ios-main
    type: mobile-ios
    name: "iOS 工程师"
    projects:
      - path: "./mobile/ios"
        description: "iOS 原生应用"
        tech_stack: [swift@5.9, swiftui]
        auto_init_kb: true

  - id: mobile-android-main
    type: mobile-android
    name: "Android 工程师"
    projects:
      - path: "./mobile/android"
        description: "Android 原生应用"
        tech_stack: [kotlin, jetpack-compose]
        auto_init_kb: true

  - id: mobile-harmony-main
    type: mobile-harmony
    name: "鸿蒙工程师"
    projects:
      - path: "./mobile/harmony"
        description: "鸿蒙应用"
        tech_stack: [arkts, arkui]
        auto_init_kb: true

# 服务间依赖关系（用于智能任务分配）
service_dependencies:
  "./frontend/web-app":
    depends_on: ["./backend/bff", "./backend/api-gateway"]
  "./frontend/admin":
    depends_on: ["./backend/bff", "./backend/api-gateway"]
  "./backend/bff":
    depends_on: ["./backend/user-service", "./backend/order-service", "./backend/data-service"]
  "./backend/api-gateway":
    depends_on: ["./backend/user-service", "./backend/order-service", "./backend/payment-service"]
  "./backend/order-service":
    depends_on: ["./backend/user-service", "./backend/payment-service"]
  "./mobile/ios":
    depends_on: ["./backend/api-gateway"]
  "./mobile/android":
    depends_on: ["./backend/api-gateway"]

# 协调配置
orchestrator:
  auto_sync_tech_docs: true
  parallel_execution: true
  backend_first: true
  max_parallel_engineers: 4
  # 项目知识库自动初始化
  auto_init_project_kb: true
  # 跨服务影响分析
  cross_service_analysis: true

# 技术文档模板
tech_doc_templates:
  api_contract: "templates/api_contract.md"
  database_design: "templates/database_design.md"
  architecture: "templates/architecture.md"
```

### 3.2 项目级知识库初始化

#### 3.2.1 初始化流程

```yaml
触发时机:
  - 首次绑定项目到工程师时
  - 执行 ~fullstack init 时
  - 工程师首次接到该项目的任务时（auto_init_kb=true）

初始化内容:
  项目目录下创建 .helloagents/:
    - INDEX.md: 项目知识库入口
    - context.md: 项目上下文（技术栈、框架版本、约定）
    - CHANGELOG.md: 项目变更历史
    - modules/: 模块文档目录
    - guidelines.md: 项目编码规范（从模板+扫描结果生成）

跳过条件:
  - 项目目录下已存在 .helloagents/INDEX.md
  - auto_init_kb=false

技术栈识别（三层来源，按优先级合并）:
  1. 配置声明（fullstack.yaml 中的 tech_stack）→ 最高优先级，用户显式指定
  2. 项目扫描（自动检测）→ 补充配置中未声明的依赖和工具
  3. 默认模板（按工程师类型）→ 兜底，提供基础规范

项目扫描规则:
  前端项目:
    - package.json: dependencies/devDependencies → 框架/工具/版本
    - vite.config.*/webpack.config.*: 构建工具配置
    - tsconfig.json: TypeScript 版本和配置
    - .eslintrc/*/.prettierrc/*: 代码规范工具
    - tailwind.config.*: UI 框架
  后端项目:
    - Java: pom.xml/build.gradle → Spring Boot/MyBatis/中间件版本
    - Python: requirements.txt/pyproject.toml/setup.py → 框架/依赖版本
    - Go: go.mod → 框架/依赖版本
    - Node.js: package.json → NestJS/Express/依赖版本
  移动端项目:
    - iOS: Package.swift/Podfile/*.xcodeproj → Swift版本/依赖库
    - Android: build.gradle.kts/build.gradle → Kotlin版本/Jetpack组件
    - 鸿蒙: oh-package.json5/build-profile.json5 → ArkTS版本/依赖

扫描结果存储（写入 context.md）:
  tech_stack:
    declared:        # 来自 fullstack.yaml 配置（用户显式指定）
      - spring-boot@3.2
      - mybatis-plus@3.5
    detected:        # 项目扫描自动识别（补充配置未声明的）
      - mysql@8.0
      - redis@7.0
      - lombok
      - mapstruct
      - junit@5.9
    effective:       # 最终生效列表（declared + detected 去重合并）
      - spring-boot@3.2
      - mybatis-plus@3.5
      - mysql@8.0
      - redis@7.0
      - lombok
      - mapstruct
      - junit@5.9

工程师使用技术栈:
  - 执行任务前读取项目 context.md 中的 effective 技术栈
  - 根据 effective 列表选择对应的编码规范和最佳实践
  - 代码生成/审查时参考实际使用的框架版本
```

#### 3.2.2 项目知识库结构

```
{project_path}/.helloagents/
├── INDEX.md              # 项目入口（链接到全局 fullstack 配置）
├── context.md            # 项目技术上下文
├── CHANGELOG.md          # 项目变更历史
├── guidelines.md         # 编码规范（框架特定）
├── modules/              # 模块文档
│   └── _index.md
└── api/                  # API 文档（后端项目专用）
    ├── _index.md
    └── {endpoint}.md
```

#### 3.2.3 与全局知识库的关系

```yaml
层级结构:
  monorepo/.helloagents/           # 全局知识库（主代理视角）
  ├── fullstack.yaml               # 全栈配置
  ├── fullstack/                   # 全栈任务状态
  │   ├── tasks/
  │   └── docs/
  └── ...

  monorepo/backend/user-service/.helloagents/   # 项目知识库（工程师视角）
  ├── INDEX.md
  ├── context.md
  └── ...

同步规则:
  - 全局 CHANGELOG 汇总各项目变更摘要
  - 项目 CHANGELOG 记录详细变更
  - 技术文档双向同步（后端 API → 前端/移动端依赖方）
```

### 3.3 多服务架构支持（CRITICAL）

#### 3.3.1 服务影响分析

```yaml
核心问题: 一个需求可能涉及多个后端服务的改动

分析流程:
  1. 需求解析 → 识别涉及的业务领域（用户、订单、支付等）
  2. 领域映射 → 根据 service_dependencies 定位受影响的服务
  3. 依赖传播 → 分析上下游服务是否需要联动修改
  4. 工程师分配 → 按服务所属工程师分配任务

示例:
  需求: "用户下单时增加积分抵扣功能"
  影响分析:
    - order-service: 订单逻辑修改（主要改动）
    - user-service: 用户积分查询/扣减接口（需新增）
    - payment-service: 支付金额计算逻辑（需修改）
    - bff: 接口聚合调整
    - frontend: 下单页面 UI 修改

  任务分配:
    be-java-core（负责 user/order/payment）:
      - T1: user-service 积分接口
      - T2: order-service 积分抵扣逻辑（depends_on: T1）
      - T3: payment-service 金额计算（depends_on: T1）
    be-node-bff:
      - T4: BFF 接口聚合（depends_on: T1, T2, T3）
    fe-react-main:
      - T5: 下单页面 UI（depends_on: T4）
```

#### 3.3.2 同一工程师多项目处理

```yaml
场景: 一个 Java 后端工程师负责多个微服务

处理策略:
  串行执行（默认）:
    - 同一工程师的多个项目任务按依赖关系串行执行
    - 避免上下文切换开销
    - 保证服务间接口一致性

  并行执行（可配置）:
    - 当项目间无依赖时可并行
    - 使用 worktree 隔离各项目
    - 主代理最后合并验证

工程师任务执行流程:
  1. 接收任务列表（可能涉及多个项目）
  2. 按项目分组，检查项目知识库
  3. 项目知识库不存在 → 执行初始化
  4. 切换到项目目录，加载项目 context.md
  5. 执行该项目的任务
  6. 完成后切换到下一个项目
  7. 所有项目完成后汇总反馈给主代理

示例（be-java-core 工程师）:
  收到任务:
    - T1: user-service 积分接口
    - T2: order-service 积分抵扣（depends_on: T1）
    - T3: payment-service 金额计算（depends_on: T1）

  执行顺序:
    1. cd ./backend/user-service → 检查/初始化 KB → 执行 T1 → 产出 API 契约
    2. cd ./backend/order-service → 检查/初始化 KB → 执行 T2（引用 T1 契约）
    3. cd ./backend/payment-service → 检查/初始化 KB → 执行 T3（引用 T1 契约）
    4. 汇总三个项目的变更 → 返回 ResultMessage
```

#### 3.3.3 跨工程师服务协调

```yaml
场景: 需求涉及不同工程师负责的服务

协调机制:
  1. 主代理分析完整依赖链
  2. 按依赖关系划分执行层级（DAG）
  3. 同层级不同工程师并发执行
  4. 上游完成后，技术文档自动同步给下游工程师
  5. 下游工程师基于 API 契约继续开发

文档同步点:
  - 后端工程师完成服务 → 输出 API 契约
  - 主代理同步契约到依赖方的项目知识库
  - 下游工程师读取契约开始开发

冲突处理:
  - 多个后端服务定义了相同的接口 → 主代理检测冲突 → 要求协调
  - 接口变更影响已完成的下游任务 → 触发下游重新验证
```

### 3.4 工程师角色定义

#### 3.4.1 角色清单

| 角色ID | 分组 | 技术栈 | 核心能力 |
|--------|------|--------|----------|
| `frontend-vue` | 前端 | Vue.js | Vue3组件开发、Composition API、状态管理、路由配置 |
| `frontend-react` | 前端 | React | React18 Hooks、状态管理(Redux/Zustand)、路由 |
| `mobile-ios` | 移动端 | iOS | Swift/SwiftUI、UIKit、Combine、网络层封装 |
| `mobile-android` | 移动端 | Android | Kotlin、Jetpack Compose、Coroutines、MVVM |
| `mobile-harmony` | 移动端 | HarmonyOS | ArkTS、ArkUI、Ability、分布式能力 |
| `backend-java` | 后端 | Java | Spring Boot、MyBatis、微服务、数据库设计 |
| `backend-python` | 后端 | Python | FastAPI/Django、SQLAlchemy、异步编程 |
| `backend-go` | 后端 | Go | Gin/Echo、GORM、高并发、微服务 |
| `backend-nodejs` | 后端 | Node.js | Express/NestJS、TypeORM、实时通信 |

#### 3.4.2 角色叠加机制（CRITICAL）

每个工程师除了拥有自己的**职能角色**（技术栈专业能力），还需要**继承 HelloAGENTS 通用角色能力**。

```yaml
角色叠加模型:
  工程师完整能力 = 职能角色（技术栈） + 通用角色（HelloAGENTS RLM）

通用角色继承:
  必须继承:
    - reviewer: 代码审查能力，自审代码质量/安全
    - kb_keeper: 知识库同步能力，更新模块文档
  可选继承（按需激活）:
    - synthesizer: 多源综合能力（跨模块分析时）
    - writer: 文档撰写能力（技术文档输出时）

继承方式:
  1. 工程师 Agent 文件中引用通用角色规则
  2. 执行时按阶段激活对应能力
  3. 输出格式兼容通用角色的 schema

示例 - Java 后端工程师完整能力:
  职能角色: Spring Boot 开发、数据库设计、API 实现
  + reviewer: 自审代码质量、安全漏洞检测
  + kb_keeper: 同步 API 文档到知识库
  + writer: 输出技术设计文档
```

**角色激活时机:**

| 阶段 | 激活的通用角色 | 触发条件 |
|------|---------------|----------|
| 代码实现后 | reviewer | 代码变更完成时自动触发 |
| 任务完成时 | kb_keeper | KB_SKIPPED=false 且有代码变更 |
| 技术文档输出 | writer | 后端工程师或配置要求时 |
| 跨模块分析 | synthesizer | 任务涉及多个模块依赖 |

#### 3.4.3 工程师代理文件结构（含角色叠加）

```markdown
---
name: ha-backend-java
description: "[HelloAGENTS Fullstack] Java 后端工程师。负责 Spring Boot 微服务开发、数据库设计、API 实现。"
tools: Read, Write, Edit, Grep, Glob, Bash
model: inherit
---

你是 HelloAGENTS 全栈模式的 Java 后端工程师子代理。

## 角色定位
- 技术栈: Java 17+, Spring Boot 3.x, MyBatis-Plus, Maven/Gradle
- 职责: 微服务开发、数据库设计、RESTful API 实现、技术文档编写

## 继承的通用角色能力

### [继承 reviewer]
你同时具备代码审查能力。在完成代码实现后，必须：
1. 自审代码质量（可读性、可维护性）
2. 检查安全漏洞（OWASP Top 10）
3. 验证性能风险（N+1查询、资源泄漏）
4. 在返回结果中包含 self_review 字段

### [继承 kb_keeper]
你同时具备知识库同步能力。在任务完成时：
1. 如果 API 发生变更，更新模块文档
2. 如果数据库结构变更，同步到知识库
3. 遵循 services/knowledge.md 的同步规则

### [继承 writer]
你同时具备技术文档撰写能力。必须输出：
1. API 契约文档（端点、请求、响应、错误码）
2. 数据库设计文档（表结构、索引、关系）

## 核心能力（职能角色）
1. Spring Boot 应用开发（Controller/Service/Mapper 三层架构）
2. 数据库表设计与 SQL 优化
3. RESTful API 设计与实现
4. 单元测试与集成测试

## 输出格式（融合通用角色）

```json
{
  "status": "completed|partial|failed",
  "engineer": "backend-java",
  "task_id": "T1",

  "code_changes": [...],

  "self_review": {
    "quality_score": 8,
    "security_issues": [],
    "performance_risks": [],
    "suggestions": []
  },

  "tech_doc": "path/to/api_doc.md",
  "kb_updates": ["modules/user-service.md"],

  "verification": {
    "lint_passed": true,
    "tests_passed": true
  }
}
```
```

### 3.5 并发执行机制（CRITICAL）

#### 3.5.1 并发调度原理

```yaml
核心原则: 任务派发后，无依赖的工程师并发执行，有依赖的按 DAG 层级串行等待

DAG 拓扑排序:
  1. 解析所有任务的 depends_on 字段
  2. 构建依赖图，计算入度
  3. 拓扑排序，划分执行层级
  4. 同层级任务并发派发

并发约束:
  - 最大并发数: 受 CLI 子代理上限约束（Claude Code Task 无硬限制，Codex CLI ≤6）
  - 同文件冲突: 使用 worktree 隔离（Claude Code）或串行执行
  - 失败传播: 某任务失败 → 下游依赖任务标记 [-]（前置失败）
```

#### 3.5.2 并发执行流程

```
┌──────────────────────────────────────────────────────────────────────┐
│                        并发执行流程                                    │
├──────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  1. 主代理解析任务依赖 → 构建 DAG                                      │
│                                                                        │
│  2. 拓扑排序 → 划分层级                                                │
│     Layer 1: [T1:backend-java, T2:backend-python]  # 无依赖，并发      │
│     Layer 2: [T3:frontend-react, T4:mobile-ios, T5:mobile-android]    │
│                                                                        │
│  3. 派发 Layer 1 (并发)                                                │
│     ┌─────────────────────────────────────────────────────┐           │
│     │  Task(ha-backend-java, T1)  ──┬──►  执行中           │           │
│     │                               │                      │           │
│     │  Task(ha-backend-python, T2) ─┴──►  执行中           │           │
│     └─────────────────────────────────────────────────────┘           │
│                                                                        │
│  4. 等待 Layer 1 全部完成 → 收集反馈 → 更新任务状态                     │
│                                                                        │
│  5. 同步技术文档到 Layer 2 任务上下文                                   │
│                                                                        │
│  6. 派发 Layer 2 (并发)                                                │
│     ┌─────────────────────────────────────────────────────┐           │
│     │  Task(ha-frontend-react, T3) ───┬──►  执行中         │           │
│     │                                 │                    │           │
│     │  Task(ha-mobile-ios, T4) ───────┼──►  执行中         │           │
│     │                                 │                    │           │
│     │  Task(ha-mobile-android, T5) ──┴──►  执行中         │           │
│     └─────────────────────────────────────────────────────┘           │
│                                                                        │
│  7. 等待 Layer 2 全部完成 → 收集反馈 → 更新任务状态                     │
│                                                                        │
│  8. 汇总所有交付物 → 生成验收报告                                       │
│                                                                        │
└──────────────────────────────────────────────────────────────────────┘
```

#### 3.5.3 Claude Code 并发调用示例

```python
# 主代理并发派发 Layer 1 任务（在同一消息中发起多个 Task 调用）
Task(
  subagent_type="ha-backend-java",
  prompt="[跳过指令] 任务T1: 实现用户注册API..."
)
Task(
  subagent_type="ha-backend-python",
  prompt="[跳过指令] 任务T2: 实现短信验证码服务..."
)
# Claude Code 会并发执行这两个 Task，等待全部完成后返回
```

### 3.6 任务状态管理（CRITICAL）

#### 3.6.1 任务状态定义

```yaml
任务状态机:
  pending    → in_progress  # 主代理派发任务
  in_progress → completed   # 工程师返回 status=completed
  in_progress → partial     # 工程师返回 status=partial（部分完成）
  in_progress → failed      # 工程师返回 status=failed
  pending    → blocked      # 前置依赖失败

状态存储:
  位置: .helloagents/fullstack/tasks/{task_group_id}.json
  更新时机: 工程师每次反馈后立即更新
```

#### 3.6.2 任务状态结构

```json
{
  "task_group_id": "fullstack_20260324_001",
  "requirement": "实现用户注册功能",
  "created_at": "2026-03-24T15:00:00",
  "updated_at": "2026-03-24T15:30:00",
  "overall_status": "in_progress",
  "progress": {
    "total": 5,
    "completed": 2,
    "in_progress": 2,
    "pending": 1,
    "failed": 0
  },

  "tasks": [
    {
      "id": "T1",
      "engineer": "backend-java",
      "description": "实现用户注册 API",
      "depends_on": [],
      "status": "completed",
      "started_at": "2026-03-24T15:01:00",
      "completed_at": "2026-03-24T15:20:00",
      "result": {
        "code_changes": [...],
        "tech_doc": "docs/user_register_api.md",
        "self_review": {...}
      }
    },
    {
      "id": "T2",
      "engineer": "backend-python",
      "description": "实现短信验证码服务",
      "depends_on": [],
      "status": "completed",
      "started_at": "2026-03-24T15:01:00",
      "completed_at": "2026-03-24T15:25:00",
      "result": {...}
    },
    {
      "id": "T3",
      "engineer": "frontend-react",
      "description": "实现 Web 端注册页面",
      "depends_on": ["T1", "T2"],
      "status": "in_progress",
      "started_at": "2026-03-24T15:26:00",
      "result": null
    },
    {
      "id": "T4",
      "engineer": "mobile-ios",
      "description": "实现 iOS 端注册功能",
      "depends_on": ["T1", "T2"],
      "status": "in_progress",
      "started_at": "2026-03-24T15:26:00",
      "result": null
    },
    {
      "id": "T5",
      "engineer": "mobile-android",
      "description": "实现 Android 端注册功能",
      "depends_on": ["T1", "T2"],
      "status": "pending",
      "started_at": null,
      "result": null
    }
  ]
}
```

#### 3.6.3 状态更新流程

```yaml
主代理状态更新职责:
  1. 派发任务时:
     - 设置 status = in_progress
     - 记录 started_at
     - 更新 progress.in_progress++, progress.pending--

  2. 收到工程师反馈时:
     - 解析 ResultMessage
     - 更新对应任务的 status, completed_at, result
     - 更新 progress 统计
     - 检查是否触发下游任务

  3. 层级完成时:
     - 检查当前层所有任务状态
     - 如果有失败: 标记依赖任务为 blocked
     - 如果全部完成: 触发下一层

  4. 全部完成时:
     - 设置 overall_status = completed
     - 生成汇总报告
     - 触发 kb_keeper 同步知识库

反馈处理流程:
  工程师返回 ResultMessage
    ↓
  主代理解析结果
    ↓
  更新 tasks.json 中对应任务状态
    ↓
  检查是否需要触发下游任务
    ↓
  如果需要: 派发下游任务
  如果不需要: 继续等待其他工程师
```

#### 3.6.4 ~fullstack status 命令输出示例

```
🔵【HelloAGENTS】- ~fullstack：任务状态

📋 需求: 实现用户注册功能
📊 进度: 2/5 (40%)

任务列表:
  [√] T1 backend-java    实现用户注册 API        完成于 15:20
  [√] T2 backend-python  实现短信验证码服务       完成于 15:25
  [→] T3 frontend-react  实现 Web 端注册页面     执行中...
  [→] T4 mobile-ios      实现 iOS 端注册功能     执行中...
  [ ] T5 mobile-android  实现 Android 端注册功能  等待中 (依赖: T1,T2)

文档同步:
  ✅ T1 → T3,T4,T5 (API契约已同步)
  ✅ T2 → T3,T4,T5 (API契约已同步)

🔄 下一步: 等待 T3, T4 完成后自动派发 T5，或使用 ~fullstack sync 手动同步。
```

### 3.7 通信协议设计

#### 3.7.1 消息格式

**主代理 → 工程师代理 (TaskMessage)**

```json
{
  "message_type": "task",
  "task_id": "T1",
  "task_group_id": "fullstack_20260324_001",
  "engineer": "backend-java",
  "priority": "high",
  "layer": 1,

  "context": {
    "requirement": "实现用户注册功能，包含手机号验证",
    "related_tech_docs": [],
    "dependencies": [],
    "project_path": "./backend/user-service"
  },

  "role_activation": {
    "reviewer": true,
    "kb_keeper": true,
    "writer": true
  },

  "constraints": {
    "deadline": "2026-03-25T18:00:00",
    "must_output_tech_doc": true,
    "test_required": true
  },

  "output_requirements": {
    "code": true,
    "tech_doc": true,
    "api_contract": true,
    "test": true,
    "self_review": true
  }
}
```

**工程师代理 → 主代理 (ResultMessage)**

```json
{
  "message_type": "result",
  "task_id": "T1",
  "task_group_id": "fullstack_20260324_001",
  "engineer": "backend-java",
  "status": "completed",

  "deliverables": {
    "code_changes": [
      {
        "file": "src/main/java/com/example/controller/UserController.java",
        "type": "create",
        "description": "用户注册接口"
      },
      {
        "file": "src/main/java/com/example/service/UserService.java",
        "type": "create",
        "description": "用户服务层"
      }
    ],
    "tech_doc": ".helloagents/fullstack/docs/user_register_api.md",
    "api_contract": ".helloagents/fullstack/contracts/user_register.yaml",
    "test_results": {
      "passed": 5,
      "failed": 0,
      "coverage": "85%"
    }
  },

  "self_review": {
    "quality_score": 8,
    "security_issues": [],
    "performance_risks": ["建议添加注册频率限制"],
    "suggestions": ["考虑添加邮箱验证功能"]
  },

  "kb_updates": [
    "modules/user-service.md"
  ],

  "needs_sync_to": ["frontend-react", "mobile-ios", "mobile-android"],

  "issues": [],
  "notes": "API 已就绪，前端可以开始联调"
}
```

**主代理任务状态更新触发:**
```yaml
收到 ResultMessage 后:
  1. 解析 status 字段 → 更新任务状态
  2. 解析 self_review 字段 → 记录代码质量信息（来自工程师继承的 reviewer 能力）
  3. 解析 kb_updates 字段 → 触发知识库同步（来自工程师继承的 kb_keeper 能力）
  4. 解析 needs_sync_to 字段 → 同步技术文档到目标工程师
  5. 检查当前层是否全部完成 → 触发下一层任务
```

#### 3.7.2 文档同步机制

```yaml
同步触发时机:
  - 后端工程师完成任务且 tech_doc 非空
  - 主代理检测到 needs_sync_to 列表非空
  - 用户手动执行 ~fullstack sync

同步流程:
  1. 主代理读取源工程师的技术文档
  2. 提取关键信息（API 端点、请求/响应格式、错误码）
  3. 注入到目标工程师的任务上下文中
  4. 目标工程师下次执行任务时自动获取

存储位置:
  - 技术文档: .helloagents/fullstack/docs/{engineer}_{doc_type}.md
  - API 契约: .helloagents/fullstack/contracts/{api_name}.yaml
  - 同步记录: .helloagents/fullstack/sync_log.json
```

### 3.8 工作流程设计

#### 3.8.1 全栈模式工作流

```
┌─────────────────────────────────────────────────────────────────────┐
│                        全栈模式工作流                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  Phase 1: 需求分析与任务拆解                                          │
│  ├─ 1.1 主代理解析用户需求                                            │
│  ├─ 1.2 识别涉及的项目/模块（根据 fullstack.yaml）                    │
│  ├─ 1.3 确定需要调度的工程师角色                                      │
│  └─ 1.4 拆解为工程师级别的子任务，建立依赖关系                         │
│                                                                       │
│  Phase 2: 后端优先执行（如果涉及后端）                                 │
│  ├─ 2.1 调度后端工程师执行任务                                        │
│  ├─ 2.2 后端工程师输出代码 + 技术文档 + API 契约                       │
│  ├─ 2.3 主代理收集后端交付物                                          │
│  └─ 2.4 主代理同步技术文档到依赖方                                    │
│                                                                       │
│  Phase 3: 前端/移动端并行执行                                         │
│  ├─ 3.1 主代理将技术文档注入前端/移动端任务上下文                      │
│  ├─ 3.2 并行调度前端和移动端工程师                                    │
│  ├─ 3.3 各工程师独立执行（不共享记忆）                                │
│  └─ 3.4 主代理收集各工程师交付物                                      │
│                                                                       │
│  Phase 4: 汇总与验收                                                  │
│  ├─ 4.1 主代理汇总所有工程师交付物                                    │
│  ├─ 4.2 执行集成验证（如果配置了验证命令）                            │
│  ├─ 4.3 生成全栈任务验收报告                                          │
│  └─ 4.4 更新知识库（按 KB_CREATE_MODE）                               │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

#### 3.8.2 任务依赖示例

```yaml
# 用户注册功能的任务拆解示例
tasks:
  - id: T1
    engineer: backend-java
    description: "实现用户注册 API"
    depends_on: []
    outputs: [api_contract, tech_doc]

  - id: T2
    engineer: backend-python
    description: "实现短信验证码服务"
    depends_on: []
    outputs: [api_contract, tech_doc]

  - id: T3
    engineer: frontend-react
    description: "实现 Web 端注册页面"
    depends_on: [T1, T2]  # 依赖后端 API 契约
    inputs: [T1.api_contract, T2.api_contract]

  - id: T4
    engineer: mobile-ios
    description: "实现 iOS 端注册功能"
    depends_on: [T1, T2]
    inputs: [T1.api_contract, T2.api_contract]

  - id: T5
    engineer: mobile-android
    description: "实现 Android 端注册功能"
    depends_on: [T1, T2]
    inputs: [T1.api_contract, T2.api_contract]

# 执行顺序:
# Layer 1: T1, T2 (后端，并行)
# Layer 2: T3, T4, T5 (前端/移动端，并行，等待 Layer 1 完成)
```

### 3.9 命令设计

| 命令 | 功能 | 示例 |
|------|------|------|
| `~fullstack` | 进入全栈模式或显示帮助 | `~fullstack` |
| `~fullstack init` | 初始化全栈模式配置 | `~fullstack init` |
| `~fullstack projects` | 查看项目-工程师绑定 | `~fullstack projects` |
| `~fullstack bind <path> <engineer>` | 绑定项目到工程师 | `~fullstack bind ./frontend/app frontend-react` |
| `~fullstack unbind <path>` | 解绑项目 | `~fullstack unbind ./frontend/app` |
| `~fullstack status` | 查看当前任务状态 | `~fullstack status` |
| `~fullstack sync` | 手动触发文档同步 | `~fullstack sync` |
| `~fullstack engineers` | 查看可用工程师角色 | `~fullstack engineers` |

### 3.10 与现有系统集成

#### 3.10.1 与 RLM 系统集成

```yaml
角色扩展:
  现有角色: reviewer, synthesizer, kb_keeper, pkg_keeper, writer
  新增角色: orchestrator, frontend-*, mobile-*, backend-*

调用通道:
  复用 G10 定义的 CLI 调用通道
  主代理调用工程师代理: Task(subagent_type="ha-{engineer}", prompt="...")

并行调度:
  复用 G10 并行调度规则
  同组工程师（如所有后端）可并行
  跨组工程师按依赖关系串行/并行
```

#### 3.10.2 与路由系统集成

```yaml
命令路径:
  ~fullstack 命令 → 匹配命令处理器 → 加载 functions/fullstack.md

通用路径增强:
  检测 fullstack.yaml 存在 → R2/R3 确认时增加选项"使用全栈模式"

状态变量扩展:
  FULLSTACK_MODE: boolean  # 是否在全栈模式下
  CURRENT_ENGINEERS: []    # 当前活跃的工程师列表
```

#### 3.10.3 与知识库集成

```yaml
目录扩展:
  {KB_ROOT}/fullstack/
  ├── config/           # fullstack.yaml 解析后的配置
  ├── docs/             # 工程师产出的技术文档
  ├── contracts/        # API 契约
  ├── tasks/            # 全栈任务状态
  └── sync_log.json     # 文档同步日志

同步规则:
  技术文档自动同步到 modules/ 目录（可配置）
  CHANGELOG 记录全栈任务完成情况
```

---

## 4. 实现优先级

### 4.1 P0 - 核心功能（必须实现）

1. 配置文件解析器（fullstack.yaml）
2. 主代理（ha-orchestrator）
3. 2 个后端工程师（Java, Python）
4. 1 个前端工程师（React）
5. 基础命令（~fullstack, init, projects, status）
6. 技术文档同步机制

### 4.2 P1 - 扩展功能

1. 其他后端工程师（Go, Node.js）
2. 另一个前端工程师（Vue）
3. 全部移动端工程师（iOS, Android, 鸿蒙）
4. 完整命令集
5. 验证与测试集成

### 4.3 P2 - 增强功能

1. 可视化任务面板
2. 工程师能力自动识别
3. 智能任务分配优化
4. 跨项目依赖分析

---

## 5. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 工程师代理上下文过长 | Token 消耗大，响应慢 | 精简技术文档，仅传递必要信息 |
| 任务依赖分析错误 | 执行顺序错误，联调失败 | 主代理验证依赖关系，用户确认 |
| 技术文档格式不统一 | 同步失败，信息丢失 | 强制使用模板，主代理格式化 |
| 并行执行冲突 | 代码冲突，集成困难 | 使用 worktree 隔离，主代理合并 |

---

## 6. 验收标准

### 6.1 功能验收

- [ ] 能够解析 fullstack.yaml 配置文件
- [ ] 能够正确识别项目与工程师绑定关系
- [ ] 主代理能够拆解需求为工程师级别任务
- [ ] 后端工程师能够输出技术文档
- [ ] 技术文档能够同步到前端/移动端工程师
- [ ] 工程师之间不共享记忆（独立上下文）
- [ ] 所有命令正常工作

### 6.2 集成验收

- [ ] 与现有 RLM 系统兼容
- [ ] 与现有路由系统兼容
- [ ] 与知识库系统兼容
- [ ] 不影响非全栈模式的正常使用

---

## 7. 参考资料

- [AGENTS.md - G9 子代理编排](../../../AGENTS.md#G9)
- [AGENTS.md - G10 子代理调用通道](../../../AGENTS.md#G10)
- [services/knowledge.md - 知识库服务](../../services/knowledge.md)
- [rlm/roles/ - 现有角色定义](../../rlm/roles/)
