# 全栈模式服务 (FullstackService)

本模块定义全栈模式服务的完整规范，包括配置解析、状态管理、文档同步和项目KB初始化。

---

## 服务概述

```yaml
服务名称: FullstackService（全栈模式服务）
服务类型: 领域服务
适用范围: 全栈模式下的工程师调度、任务分配、文档同步

核心职责:
  - 配置解析: 解析 fullstack.yaml，提取工程师定义和服务依赖
  - 状态管理: 管理全栈任务的执行状态和进度
  - 文档同步: 后端技术文档同步到前端/移动端依赖方
  - 项目KB初始化: 为各项目创建独立的知识库

专用执行者: orchestrator（主代理角色）
数据所有权:
  - {KB_ROOT}/fullstack.yaml
  - {KB_ROOT}/fullstack/（任务状态、文档）
  - {project_path}/.helloagents/（项目级知识库）
```

---

## 服务接口

### parseConfig()

```yaml
触发: ~fullstack 命令或全栈模式启动时
参数: configPath（默认 {KB_ROOT}/fullstack.yaml）
流程:
  1. 读取配置文件
  2. 验证配置格式（engineers, service_dependencies, orchestrator）
  3. 解析工程师定义和项目绑定
  4. 构建服务依赖图
返回: { success, config, engineers[], service_deps{}, errors[] }
```

### getEngineerForProject(projectPath)

```yaml
触发: 任务分配时
参数: projectPath（项目路径）
流程:
  1. 在 config.engineers 中查找绑定该路径的工程师
  2. 返回工程师信息（id, type, name, projects）
返回: { found, engineer, error }
```

### analyzeServiceDependencies(projects)

```yaml
触发: 需求拆解时
参数: projects[]（涉及的项目列表）
流程:
  1. 读取 service_dependencies 配置
  2. 递归查找上下游依赖
  3. 构建依赖图并拓扑排序
  4. 计算执行层级
返回: { dag, layers[], affected_projects[], execution_order[] }
```

### initProjectKB(projectPath, techStack)

```yaml
触发: 工程师首次接到项目任务时（auto_init_kb=true）
参数: projectPath, techStack（declared 技术栈）
流程:
  1. 检查 {projectPath}/.helloagents/INDEX.md 是否存在
  2. 存在 → 跳过，返回 { skipped: true }
  3. 不存在 → 调用技术栈扫描器获取 detected 技术栈
  4. 合并 declared + detected → effective
  5. 根据技术栈类型选择模板
  6. 创建 .helloagents/ 目录结构
  7. 生成 context.md, guidelines.md, INDEX.md, CHANGELOG.md
返回: { success, created_files[], tech_stack: { declared, detected, effective } }
```

### syncTechDoc(sourceDoc, targetProjects)

```yaml
触发: 后端工程师完成技术文档后
参数: sourceDoc（源文档路径）, targetProjects[]（目标项目列表）
流程:
  1. 读取源文档内容
  2. 提取关键信息（API契约、数据模型）
  3. 为每个目标项目写入 .helloagents/api/{endpoint}.md
  4. 记录同步日志
返回: { success, synced_to[], errors[] }
```

### getTaskState(taskGroupId)

```yaml
触发: 查询任务状态时
参数: taskGroupId（任务组ID）
流程:
  1. 读取 {KB_ROOT}/fullstack/tasks/{taskGroupId}.json
  2. 解析任务状态
返回: { tasks[], progress: { total, completed, failed }, overall_status }
```

### updateTaskState(taskGroupId, taskId, status, result)

```yaml
触发: 工程师反馈任务结果时
参数: taskGroupId, taskId, status, result
流程:
  1. 读取当前状态
  2. 更新指定任务状态
  3. 重新计算进度
  4. 检查是否触发下游任务
  5. 写入状态文件
返回: { success, progress, triggered_tasks[] }
```

---

## 工程师类型定义

```yaml
前端工程师:
  frontend-react: React 前端工程师（React 18 + TypeScript）
  frontend-vue: Vue 前端工程师（Vue 3 + TypeScript）

后端工程师:
  backend-java: Java 后端工程师（Spring Boot 3.x）
  backend-python: Python 后端工程师（FastAPI/Django）
  backend-go: Go 后端工程师（Gin/Echo）
  backend-nodejs: Node.js 后端工程师（NestJS/Express）

移动端工程师:
  mobile-ios: iOS 工程师（Swift/SwiftUI）
  mobile-android: Android 工程师（Kotlin/Compose）
  mobile-harmony: 鸿蒙工程师（ArkTS/ArkUI）
```

---

## 角色叠加机制

```yaml
工程师完整能力: 职能角色（技术栈） + 通用角色（HelloAGENTS RLM）

通用角色继承:
  必须继承:
    - reviewer: 代码审查能力，自审代码质量/安全
    - kb_keeper: 知识库同步能力，更新模块文档
  可选继承（按需激活）:
    - synthesizer: 多源综合能力（跨模块分析时）
    - writer: 文档撰写能力（技术文档输出时）

角色激活: 主代理在 TaskMessage.role_activation 中指定
优先级: 职能角色专业知识 > 通用角色通用能力
冲突处理: 职能角色的技术规范覆盖通用角色的通用规范
```

---

## 状态管理

### 任务状态流转

```yaml
状态机:
  pending → in_progress → completed | partial | failed | blocked

转换规则:
  pending → in_progress: 工程师开始执行
  in_progress → completed: 任务成功完成
  in_progress → partial: 部分完成（有未完成子项）
  in_progress → failed: 执行失败
  pending → blocked: 前置任务失败
```

### 状态文件结构

```json
{
  "task_group_id": "20260324-积分功能",
  "created_at": "2026-03-24T15:00:00Z",
  "updated_at": "2026-03-24T15:30:00Z",
  "overall_status": "in_progress",
  "progress": {
    "total": 5,
    "completed": 2,
    "failed": 0,
    "pending": 2,
    "in_progress": 1
  },
  "tasks": [
    {
      "task_id": "T1",
      "engineer_id": "be-java-core",
      "project": "./backend/user-service",
      "description": "用户积分接口",
      "status": "completed",
      "depends_on": [],
      "result": { "api_contract": "api/user_points.md" }
    }
  ]
}
```

---

## 文档同步规则

```yaml
同步触发:
  - 后端工程师完成任务且输出包含技术文档
  - 主代理检测到 API 契约变更
  - 手动执行 ~fullstack sync

同步目标:
  根据 service_dependencies 配置确定依赖方项目

同步内容:
  - API 契约: 端点、请求/响应格式、错误码
  - 数据模型: 实体定义、字段说明
  - 接口变更: 版本号、变更说明

同步位置:
  目标项目的 .helloagents/api/{source_service}_{endpoint}.md
```
