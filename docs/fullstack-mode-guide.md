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

## 3. 首次使用推荐流程（方案1：向导式绑定）

如果你的多个项目不在同一个目录下，推荐使用“先绑定后初始化”的流程：

聊天命令方式：

```bash
~fullstack runtime set-root '~/.helloagents/runtime'
~fullstack init
~fullstack bind wizard
~fullstack kb init --all
~fullstack dispatch-plan '/abs/path/project-a' '/abs/path/project-b'
~fullstack status
~fullstack projects
```

终端回退方式（当聊天命令环境未加载时）：

```bash
helloagents fullstack runtime set-root '~/.helloagents/runtime'
helloagents fullstack runtime get-root
helloagents fullstack runtime clear-root
helloagents fullstack migrate --dry-run '/abs/path/project' '/abs/path/project/.helloagents'
helloagents fullstack migrate --to-global '/abs/path/project' '/abs/path/project/.helloagents'
helloagents fullstack migrate --rollback '/abs/path/project'
```

向导特性：

- 支持一次输入多个本地**绝对路径**（可跨磁盘、跨目录）
- 按工程师类型批量绑定（如 `backend-java`）
- 支持冲突迁移（项目已绑定到其他工程师时可选择自动迁移）
- 绑定完成后可一键初始化全部项目 KB
## 4. 常用命令

```bash
~fullstack init
~fullstack projects
~fullstack status
~fullstack bind
~fullstack unbind
~fullstack sync
~fullstack engineers
~fullstack bind wizard
~fullstack bind '/abs/path/project' --engineer-id be-java-main --allow-rebind
~fullstack unbind '/abs/path/project'
~fullstack kb init --all
~fullstack runtime set-root '~/.helloagents/runtime'
~fullstack runtime get-root
~fullstack runtime clear-root
```

终端回退（仅 runtime 管理）：

```bash
helloagents fullstack runtime set-root '~/.helloagents/runtime'
helloagents fullstack runtime get-root
helloagents fullstack runtime clear-root
```

说明：

- `projects`：查看项目与工程师映射
- `status`：查看任务组进度与层级状态
- `bind/unbind/wizard-bind`：维护项目归属（支持绝对路径）
- `sync`：同步上游技术文档到依赖项目
- `engineers`：查看工程师类型与覆盖范围
- `kb init --all`：批量初始化已绑定项目的知识库
- `dispatch-plan`：仅输出可派发项目（已绑定工程师），未绑定项目只给补绑提示并跳过（非阻断）
- `runtime set-root/get-root/clear-root`：在 `init` 前设置/查看/清理运行态根目录
- `migrate --dry-run/--to-global/--rollback`：将 legacy 路径中的 fullstack 配置与运行态迁移到全局目录（支持回滚）

兼容读取说明：

- `fullstack_config.py @auto` 会按“全局优先，项目内兜底”自动解析配置路径  
  优先级：`HELLOAGENTS_FULLSTACK_CONFIG_FILE` > `FULLSTACK_CONFIG_ROOT/fullstack.yaml` > `{KB_ROOT}/fullstack/fullstack.yaml`

## 5. 执行流程（建议）

1. 初始化配置
2. 通过向导绑定项目目录到角色（可跨目录输入绝对路径）
3. 批量初始化项目知识库
4. 检查绑定关系
5. 输入需求后由主代理做影响分析
6. 生成任务 DAG 并按层并行派发
7. 接收工程师反馈，自动触发下游任务
8. 汇总结果并同步技术文档

## 6. 绑定示例（Java 后端多项目，不同目录）

```bash
~fullstack bind '/Users/me/workspace/user-service' --engineer-id be-java-main --allow-rebind
~fullstack bind '/Volumes/dev/order-service' --engineer-id be-java-main --allow-rebind
~fullstack bind '/opt/projects/invoice-service' --engineer-id be-java-main --allow-rebind
~fullstack kb init --all
```

## 7. 技术能力说明

当前全栈模式支持：

- 配置解析（含无 PyYAML 环境降级解析）
- 跨项目依赖分析（含循环依赖检测）
- 工程师自动识别（配置优先，扫描推断兜底）
- 项目知识库检查与自动初始化
- 对 legacy/半成品 KB 的补齐修复（保留原有 plan/archive/CHANGELOG）
- 为每个项目生成面向对应工程师的独立会话补全文档任务
- 任务状态管理（feedback/report）
- 向导式绑定与绝对路径多项目映射
- 主代理按绑定过滤派发（只给存在的职能工程师分配任务）
- 未绑定项目只告警不阻断：有可派发项目时继续执行
- 统一的全栈全局根目录可配置到用户目录（`FULLSTACK_RUNTIME_ROOT`）
- 首次初始化前可先选择 `fullstack` 文件夹放在项目内还是用户目录，并将选择写入全局配置

## 9. 全局目录（避免多项目 Git 冲突）

可在 `~/.helloagents/helloagents.json` 配置：

```json
{
  "FULLSTACK_RUNTIME_ROOT": "~/.helloagents/runtime"
}
```

可直接用聊天命令设置（推荐，支持 `init` 前执行）：

```bash
~fullstack runtime choose-root
~fullstack runtime set-root '~/.helloagents/runtime'
~fullstack runtime get-root
~fullstack runtime clear-root
```

如果当前聊天环境提示该命令不可用，可用终端命令等价设置：

```bash
helloagents fullstack runtime choose-root
helloagents fullstack runtime set-root '~/.helloagents/runtime'
helloagents fullstack runtime get-root
helloagents fullstack runtime clear-root
```

行为：

- 若首次尚未决定位置，可先通过 `choose-root` 选择：
  - `project`：保留项目内 `fullstack` 文件夹
  - `global`：改用用户目录并全局记住
- 配置后：
  - 任务状态写入 `FULLSTACK_RUNTIME_ROOT/{project_hash}/fullstack/tasks/`
  - `fullstack.yaml` 默认写入 `FULLSTACK_RUNTIME_ROOT/config/fullstack.yaml`
  - 迁移索引默认写入 `FULLSTACK_RUNTIME_ROOT/index/`
- 未配置：继续回退到 legacy 项目内 `.helloagents/fullstack/*`

## 8. 排查建议

- 配置错误：先执行配置校验并检查 `engineers` / `service_dependencies`
- 任务无进展：查看 `~fullstack status`，确认是否有上游阻塞
- 文档未同步：检查 `sync` 输入参数和目标项目路径
- 项目 KB 未创建：确认 `auto_init_kb=true` 且路径有效
- 绑定冲突：`bind` 时加 `--allow-rebind`，或先执行 `unbind`
