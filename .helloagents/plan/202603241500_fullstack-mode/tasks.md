# 全栈模式 (Fullstack Mode) 任务清单

> 方案包: 202603241500_fullstack-mode
> 创建时间: 2026-03-24
> 状态: draft

---

## 元数据

```yaml
total_tasks: 41
estimated_complexity: complex
priority: P0 → P1 → P2
dependencies_declared: true
concurrent_execution: true
role_composition: true
task_state_management: true
multi_service_architecture: true
project_level_kb: true
tech_stack_detection: true  # 项目技术栈自动扫描
```

---

## 任务清单

### Phase 1: 基础架构（P0 核心）

#### 1. 配置系统

- [√] 1.1 创建全栈模式服务定义 | depends_on: []
  - 文件: `helloagents/services/fullstack.md`
  - 内容: FullstackService 定义（配置解析、状态管理、文档同步、项目KB初始化）
  - 验收: 服务定义完整，包含所有核心方法签名

- [√] 1.2 实现配置文件解析脚本 | depends_on: [1.1]
  - 文件: `helloagents/scripts/fullstack_config.py`
  - 功能: 解析 `.helloagents/fullstack.yaml`（新格式：engineers + service_dependencies）
  - 验收: 能正确解析多项目工程师配置和服务依赖关系

- [√] 1.3 创建配置文件模板 | depends_on: []
  - 文件: `helloagents/templates/fullstack.yaml`
  - 内容: 完整的配置文件模板（工程师定义+多项目绑定+服务依赖+auto_init_kb）
  - 验收: 模板可直接使用，注释清晰，支持多服务架构

- [√] 1.4 实现服务依赖分析器 | depends_on: [1.2]
  - 文件: `helloagents/scripts/fullstack_deps.py`
  - 功能: 解析 service_dependencies → 构建依赖图 → 计算影响范围 → 确定修改顺序
  - 验收: 能正确分析跨服务影响，输出受影响的项目列表

- [√] 1.5 实现项目技术栈扫描器 | depends_on: []
  - 文件: `helloagents/scripts/fullstack_tech_scanner.py`
  - 功能: 扫描项目文件 → 识别框架/依赖/版本 → 输出 detected 技术栈列表
  - 支持: package.json, pom.xml, build.gradle, requirements.txt, go.mod, Podfile 等
  - 验收: 能正确识别各技术栈的主要框架和依赖版本

- [√] 1.6 实现项目知识库初始化器 | depends_on: [1.1, 1.5]
  - 文件: `helloagents/scripts/fullstack_init_project_kb.py`
  - 功能: 检查KB是否存在 → 调用技术栈扫描器 → 合并 declared+detected → 生成 context.md/guidelines.md
  - 验收: 能正确初始化各技术栈的项目知识库，已存在时跳过

- [√] 1.7 创建各技术栈项目KB模板 | depends_on: []
  - 文件: `helloagents/templates/project_kb/{tech_stack}/`
  - 内容: React/Vue/Java/Python/Go/Node.js/iOS/Android/鸿蒙 各技术栈的项目KB模板
  - 验收: 每个技术栈有独立的context.md和guidelines.md模板

#### 2. 主代理（Orchestrator）

- [√] 2.1 创建主代理角色预设 | depends_on: [1.1]
  - 文件: `helloagents/rlm/roles/orchestrator.md`
  - 内容: 主代理角色定义（职责、能力、工作原则、输出格式）
  - 验收: 角色定义完整，与现有角色格式一致

- [√] 2.2 创建主代理 Agent 文件 | depends_on: [2.1]
  - 文件: `helloagents/agents/ha-orchestrator.md`
  - 内容: Claude Code Agent 定义（frontmatter + 执行规则）
  - 验收: 格式与 ha-reviewer.md 一致，tools 配置正确

- [√] 2.3 实现任务拆解逻辑 | depends_on: [2.2, 1.2, 1.4]
  - 位置: 主代理执行规则内
  - 功能: 解析需求 → 调用服务依赖分析器 → 识别涉及的所有项目 → 拆解为工程师级任务 → 建立 DAG 依赖
  - 验收: 能正确拆解跨服务需求，自动识别上下游影响

- [√] 2.4 实现并发调度器 | depends_on: [2.3]
  - 位置: 主代理执行规则内
  - 功能: DAG 拓扑排序 → 同层任务并发派发 → 层级间串行等待
  - 验收: 并发调度符合 G10 规则，同层任务正确并行

- [√] 2.5 实现任务状态管理器 | depends_on: [2.4]
  - 位置: 主代理执行规则内
  - 功能: 接收工程师反馈 → 实时更新任务状态 → 触发下游任务 → 生成进度报告
  - 验收: 状态更新实时，进度统计准确

- [√] 2.6 实现多项目任务分配逻辑 | depends_on: [2.3]
  - 位置: 主代理执行规则内
  - 功能: 同一工程师多个项目任务的分组 → 按项目依赖排序 → 构建项目切换上下文
  - 验收: 同一工程师的多项目任务能正确串行/并行执行

- [√] 2.7 实现项目KB检查与初始化触发 | depends_on: [2.6, 1.6]
  - 位置: 主代理执行规则内
  - 功能: 派发任务前检查目标项目KB → 不存在则触发初始化（含技术栈扫描）→ 等待初始化完成后派发任务
  - 验收: 工程师首次接任务时自动完成项目KB初始化，技术栈正确识别

#### 3. 通信协议与状态管理

- [√] 3.1 定义消息格式 Schema | depends_on: []
  - 文件: `helloagents/rlm/schemas/fullstack_message.json`
  - 内容: TaskMessage（含 role_activation）和 ResultMessage（含 self_review/kb_updates）的 JSON Schema
  - 验收: Schema 完整，可用于验证，包含角色激活和反馈字段

- [√] 3.2 实现文档同步脚本 | depends_on: [3.1]
  - 文件: `helloagents/scripts/fullstack_sync.py`
  - 功能: 读取源文档 → 提取关键信息 → 写入目标位置 → 记录同步日志
  - 验收: 能正确同步技术文档，日志记录完整

- [√] 3.3 创建 API 契约模板 | depends_on: []
  - 文件: `helloagents/templates/api_contract.md`
  - 内容: RESTful API 契约模板（端点、请求、响应、错误码）
  - 验收: 模板结构清晰，可直接填写

- [√] 3.4 定义任务状态结构 | depends_on: [3.1]
  - 文件: `helloagents/rlm/schemas/fullstack_task_state.json`
  - 内容: 任务状态 JSON Schema（task_group_id, tasks[], progress, overall_status）
  - 验收: Schema 完整，支持状态机转换验证

- [√] 3.5 实现任务状态存储逻辑 | depends_on: [3.4]
  - 位置: `helloagents/scripts/fullstack_state.py`
  - 功能: 读取/写入任务状态 JSON → 状态转换验证 → 进度统计计算
  - 验收: 状态更新正确，支持实时读取

---

### Phase 2: 工程师代理（P0 核心）

#### 4. 后端工程师

- [√] 4.1 创建 Java 后端工程师角色预设 | depends_on: []
  - 文件: `helloagents/rlm/roles/backend_java.md`
  - 内容: Java 工程师角色定义（Spring Boot 专业知识 + 继承 reviewer/kb_keeper/writer 能力）
  - 验收: 角色定义完整，技术栈覆盖 Spring Boot 3.x，包含角色叠加声明

- [√] 4.2 创建 Java 后端工程师 Agent 文件 | depends_on: [4.1]
  - 文件: `helloagents/agents/ha-backend-java.md`
  - 内容: Claude Code Agent 定义（含角色继承声明、输出格式含 self_review/kb_updates）
  - 验收: 格式正确，包含技术文档输出要求，输出格式含 self_review 字段

- [√] 4.3 创建 Python 后端工程师角色预设 | depends_on: []
  - 文件: `helloagents/rlm/roles/backend_python.md`
  - 内容: Python 工程师角色定义（FastAPI/Django 专业知识 + 继承 reviewer/kb_keeper/writer 能力）
  - 验收: 角色定义完整，技术栈覆盖 FastAPI，包含角色叠加声明

- [√] 4.4 创建 Python 后端工程师 Agent 文件 | depends_on: [4.3]
  - 文件: `helloagents/agents/ha-backend-python.md`
  - 内容: Claude Code Agent 定义（含角色继承声明、输出格式含 self_review/kb_updates）
  - 验收: 格式正确，包含技术文档输出要求，输出格式含 self_review 字段

#### 5. 前端工程师

- [√] 5.1 创建 React 前端工程师角色预设 | depends_on: []
  - 文件: `helloagents/rlm/roles/frontend_react.md`
  - 内容: React 工程师角色定义（React18 专业知识 + 继承 reviewer/kb_keeper 能力）
  - 验收: 角色定义完整，技术栈覆盖 React18 + TypeScript，包含角色叠加声明

- [√] 5.2 创建 React 前端工程师 Agent 文件 | depends_on: [5.1]
  - 文件: `helloagents/agents/ha-frontend-react.md`
  - 内容: Claude Code Agent 定义（含角色继承声明、输出格式含 self_review/kb_updates）
  - 验收: 格式正确，输出格式含 self_review 字段

---

### Phase 3: 命令系统（P0 核心）

#### 6. 核心命令

- [√] 6.1 创建 ~fullstack 命令模块 | depends_on: [2.2, 4.2, 4.4, 5.2]
  - 文件: `helloagents/functions/fullstack.md`
  - 内容: 命令定义（帮助、子命令路由）
  - 验收: 命令格式与现有命令一致

- [√] 6.2 实现 ~fullstack init 子命令 | depends_on: [6.1, 1.3]
  - 位置: `helloagents/functions/fullstack.md`
  - 功能: 创建 .helloagents/fullstack.yaml 配置文件
  - 验收: 能正确初始化配置

- [√] 6.3 实现 ~fullstack projects 子命令 | depends_on: [6.1, 1.2]
  - 位置: `helloagents/functions/fullstack.md`
  - 功能: 显示项目-工程师绑定关系
  - 验收: 输出格式清晰

- [√] 6.4 实现 ~fullstack status 子命令 | depends_on: [6.1]
  - 位置: `helloagents/functions/fullstack.md`
  - 功能: 显示当前全栈任务状态
  - 验收: 能显示任务进度

- [√] 6.5 实现 ~fullstack bind 子命令 | depends_on: [6.1, 1.2]
  - 位置: `helloagents/functions/fullstack.md`
  - 功能: 绑定项目到工程师
  - 验收: 能正确修改配置文件

- [√] 6.6 实现 ~fullstack sync 子命令 | depends_on: [6.1, 3.2]
  - 位置: `helloagents/functions/fullstack.md`
  - 功能: 手动触发文档同步
  - 验收: 能正确同步文档

---

### Phase 4: 系统集成（P0 核心）

#### 7. 与现有系统集成

- [√] 7.1 更新 AGENTS.md G9 节 | depends_on: [2.2, 4.2, 4.4, 5.2]
  - 文件: `AGENTS.md`
  - 内容: 在角色清单中添加全栈模式角色
  - 验收: 角色清单更新，保持格式一致

- [√] 7.2 更新 AGENTS.md G7 节 | depends_on: [6.1]
  - 文件: `AGENTS.md`
  - 内容: 在按需读取表中添加 ~fullstack 命令
  - 验收: 模块加载规则正确

- [√] 7.3 更新知识库目录结构说明 | depends_on: []
  - 文件: `AGENTS.md` G1 节
  - 内容: 添加 fullstack/ 子目录说明
  - 验收: 目录结构说明完整

- [√] 7.4 创建安装器扩展 | depends_on: [4.2, 4.4, 5.2, 2.2]
  - 文件: `helloagents/installer.py` (修改)
  - 功能: 安装时部署全栈模式 Agent 文件
  - 验收: 安装后 Agent 文件存在于正确位置

---

### Phase 5: 扩展工程师（P1）

#### 8. 更多后端工程师

- [√] 8.1 创建 Go 后端工程师 | depends_on: [4.1]
  - 文件: `rlm/roles/backend_go.md`, `agents/ha-backend-go.md`
  - 内容: Go 工程师角色定义（Gin/Echo 专业知识 + 继承 reviewer/kb_keeper/writer 能力）
  - 验收: 格式与 Java 工程师一致，包含角色叠加声明

- [√] 8.2 创建 Node.js 后端工程师 | depends_on: [4.1]
  - 文件: `rlm/roles/backend_nodejs.md`, `agents/ha-backend-nodejs.md`
  - 内容: Node.js 工程师角色定义（Express/NestJS 专业知识 + 继承 reviewer/kb_keeper/writer 能力）
  - 验收: 格式与 Java 工程师一致，包含角色叠加声明

#### 9. Vue 前端工程师

- [√] 9.1 创建 Vue 前端工程师 | depends_on: [5.1]
  - 文件: `rlm/roles/frontend_vue.md`, `agents/ha-frontend-vue.md`
  - 内容: Vue 工程师角色定义（Vue3 专业知识 + 继承 reviewer/kb_keeper 能力）
  - 验收: 格式与 React 工程师一致，包含角色叠加声明

#### 10. 移动端工程师

- [√] 10.1 创建 iOS 移动端工程师 | depends_on: []
  - 文件: `rlm/roles/mobile_ios.md`, `agents/ha-mobile-ios.md`
  - 内容: iOS 工程师角色定义（Swift/SwiftUI 专业知识 + 继承 reviewer/kb_keeper 能力）
  - 验收: 角色定义完整，技术栈覆盖 Swift/SwiftUI，包含角色叠加声明

- [√] 10.2 创建 Android 移动端工程师 | depends_on: []
  - 文件: `rlm/roles/mobile_android.md`, `agents/ha-mobile-android.md`
  - 内容: Android 工程师角色定义（Kotlin/Compose 专业知识 + 继承 reviewer/kb_keeper 能力）
  - 验收: 角色定义完整，技术栈覆盖 Kotlin/Compose，包含角色叠加声明

- [√] 10.3 创建鸿蒙移动端工程师 | depends_on: []
  - 文件: `rlm/roles/mobile_harmony.md`, `agents/ha-mobile-harmony.md`
  - 内容: 鸿蒙工程师角色定义（ArkTS/ArkUI 专业知识 + 继承 reviewer/kb_keeper 能力）
  - 验收: 角色定义完整，技术栈覆盖 ArkTS/ArkUI，包含角色叠加声明

---

### Phase 6: 完善命令（P1）

#### 11. 扩展命令

- [√] 11.1 实现 ~fullstack unbind 子命令 | depends_on: [6.5]
  - 功能: 解绑项目
  - 验收: 能正确修改配置

- [√] 11.2 实现 ~fullstack engineers 子命令 | depends_on: [6.1]
  - 功能: 显示所有可用工程师角色
  - 验收: 输出格式清晰

---

### Phase 7: 文档与测试（P1）

#### 12. 文档

- [√] 12.1 更新 README_CN.md | depends_on: [6.1]
  - 内容: 添加全栈模式使用说明
  - 验收: 说明清晰，包含示例

- [√] 12.2 创建全栈模式使用指南 | depends_on: [6.1]
  - 文件: 可作为 README 的一部分或独立文档
  - 内容: 完整的使用流程、配置说明、最佳实践
  - 验收: 新用户可根据指南完成配置

---

### Phase 8: 增强功能（P2）

#### 13. 高级功能

- [√] 13.1 实现工程师能力自动识别 | depends_on: [1.2]
  - 功能: 根据项目文件自动推断应该使用哪种工程师
  - 验收: 能正确识别常见项目类型

- [√] 13.2 实现跨项目依赖分析 | depends_on: [2.3]
  - 功能: 分析多项目之间的依赖关系
  - 验收: 能识别 API 调用关系

---

## 执行顺序（DAG 拓扑排序）

```
Layer 1 (无依赖，可并行):
  1.1, 1.3, 1.5, 1.7, 3.1, 3.3, 4.1, 4.3, 5.1, 7.3, 10.1, 10.2, 10.3

Layer 2 (依赖 Layer 1):
  1.2, 1.6, 2.1, 3.2, 3.4, 4.2, 4.4, 5.2

Layer 3 (依赖 Layer 2):
  1.4, 2.2, 3.5, 6.1

Layer 4 (依赖 Layer 3):
  2.3, 6.2, 6.3, 6.4, 6.5, 6.6, 7.1, 7.2, 7.4

Layer 5 (依赖 Layer 4):
  2.4, 2.6, 8.1, 8.2, 9.1, 11.1, 11.2, 12.1, 12.2

Layer 6 (依赖 Layer 5):
  2.5, 2.7, 13.1, 13.2
```

---

## 验收检查清单

### P0 完成标准

- [√] fullstack.yaml 配置文件可正确解析（新格式：engineers + service_dependencies）
- [√] 服务依赖分析器能正确识别跨服务影响
- [√] 项目技术栈扫描器能正确识别各类型项目的依赖和版本
- [√] 主代理能拆解需求为工程师任务（含跨服务依赖分析）
- [√] 主代理能按 DAG 层级并发调度工程师
- [√] 主代理能根据工程师反馈实时更新任务状态
- [√] 同一工程师负责多个项目时能正确分配和切换
- [√] 项目知识库自动初始化功能正常（auto_init_kb=true）
- [√] 技术栈识别三层合并正确（declared + detected → effective）
- [√] 各技术栈项目KB模板可用
- [√] Java 和 Python 后端工程师可正常工作（支持多服务）
- [√] React 前端工程师可正常工作
- [√] 工程师继承 reviewer/kb_keeper 通用角色能力
- [√] 工程师输出包含 self_review 和 kb_updates 字段
- [√] 技术文档同步机制正常工作（跨项目同步）
- [√] 基础命令（~fullstack, init, projects, status）正常工作
- [√] 与现有 RLM 系统兼容
- [√] 不影响非全栈模式的正常使用

### P1 完成标准

- [√] 全部工程师角色可用
- [√] 全部命令正常工作
- [√] 文档完整

### P2 完成标准

- [√] 自动识别功能可用
- [√] 跨项目依赖分析可用

---

## 风险清单

| 任务 | 风险 | 缓解措施 |
|------|------|----------|
| 1.4 服务依赖分析 | 依赖关系复杂难以准确分析 | 结合代码扫描+配置声明双重验证 |
| 1.5 技术栈扫描 | 依赖文件格式多样，版本识别不准确 | 支持主流格式，版本解析失败时标记为 unknown |
| 1.6 项目KB初始化 | declared 和 detected 冲突 | declared 优先，detected 仅补充 |
| 2.3 任务拆解 | 跨服务需求拆解复杂度高 | 先实现简单场景，迭代完善 |
| 2.4 并发调度 | 同文件冲突 | 使用 worktree 隔离或串行执行 |
| 2.5 状态管理 | 状态同步延迟 | 工程师每次反馈后立即更新 |
| 2.6 多项目任务分配 | 项目间依赖识别遗漏 | 依赖 service_dependencies 配置+代码分析 |
| 3.2 文档同步 | 格式不统一 | 强制使用模板 |
| 4.x/5.x 角色叠加 | 角色能力冲突 | 明确优先级：职能角色 > 通用角色 |
| 7.4 安装器扩展 | 可能影响现有安装流程 | 充分测试，保持向后兼容 |
