# 全栈模式使用指南

本文档说明如何在 HelloAGENTS 中使用 `~fullstack` 管理多项目、多工程师协同开发。

## 1. 适用场景

- 一个需求涉及多个项目（如前端 + BFF + 后端服务）
- 需要按依赖关系分批并行执行
- 希望自动完成任务拆解、状态追踪、技术文档同步

## 2. 配置文件

全栈模式配置文件路径：

`{KB_ROOT}/fullstack/fullstack.yaml`

建议先执行：

```bash
~fullstack init
```

它会初始化全栈配置模板与任务目录。

## 3. 常用命令

```bash
~fullstack init
~fullstack projects
~fullstack status
~fullstack bind
~fullstack unbind
~fullstack sync
~fullstack engineers
```

说明：

- `projects`：查看项目与工程师映射
- `status`：查看任务组进度与层级状态
- `bind/unbind`：维护项目归属
- `sync`：同步上游技术文档到依赖项目
- `engineers`：查看工程师类型与覆盖范围

## 4. 执行流程（建议）

1. 初始化配置并检查绑定关系
2. 输入需求后由主代理做影响分析
3. 生成任务 DAG 并按层并行派发
4. 接收工程师反馈，自动触发下游任务
5. 汇总结果并同步技术文档

## 5. 技术能力说明

当前全栈模式支持：

- 配置解析（含无 PyYAML 环境降级解析）
- 跨项目依赖分析（含循环依赖检测）
- 工程师自动识别（配置优先，扫描推断兜底）
- 项目知识库检查与自动初始化
- 任务状态管理（feedback/report）

## 6. 排查建议

- 配置错误：先执行配置校验并检查 `engineers` / `service_dependencies`
- 任务无进展：查看 `~fullstack status`，确认是否有上游阻塞
- 文档未同步：检查 `sync` 输入参数和目标项目路径
- 项目 KB 未创建：确认 `auto_init_kb=true` 且路径有效

