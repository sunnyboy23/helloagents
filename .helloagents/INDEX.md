# HelloAGENTS 知识库

> 本文件是知识库的入口点

## 快速导航

| 需要了解 | 读取文件 |
|---------|---------|
| 项目概况、技术栈、开发约定 | [context.md](context.md) |
| 模块索引 | [modules/_index.md](modules/_index.md) |
| 某个模块的职责和接口 | [modules/{模块名}.md](modules/{模块名}.md) |
| 项目变更历史 | [CHANGELOG.md](CHANGELOG.md) |
| 历史方案索引 | [archive/_index.md](archive/_index.md) |
| 当前待执行的方案 | [plan/](plan/) |
| 历史会话记录 | [sessions/](sessions/) |

## 模块关键词索引

> AI 读取此表即可判断哪些模块与当前需求相关，按需深读。

| 模块 | 关键词 | 摘要 |
|------|--------|------|
| core-cli | CLI 入口, 交互菜单, 目标检测 | CLI 主入口与交互式操作入口 |
| installer | 安装, 卸载, 部署 | 安装/卸载 HelloAGENTS 到各 CLI |
| updater | 更新, 状态, 清理 | 版本更新与状态检查 |
| version-check | 版本, 缓存, 更新检查 | 远程版本检测与缓存读写 |
| config | 配置, hooks, permissions | CLI 目标配置与权限/Hook 管理 |
| platform-win | Windows, 锁文件, 安全删除 | Windows 平台专用逻辑 |
| rlm | 角色, session, shared-tasks | 子代理角色与会话管理 |
| services | 知识库, 方案包, 记忆 | 领域服务定义与协作规则 |
| stages | 设计, 实施, 阶段链 | 方案设计与开发实施流程 |
| rules | 路由, 状态, 工具 | 执行规则与约束集合 |
| functions | 命令, gate, 流程 | 内置命令与流程说明 |
| scripts | 脚本, 校验, 迁移 | CLI 脚本工具集 |
| templates | 模板, KB, 方案包 | 文档与方案包模板 |
| hooks | Hook, 生命周期, 集成 | CLI Hook 参考与配置 |
| distribution | 发布, 安装脚本, npm | 包分发与安装入口 |
| docs | README, 贡献, 许可 | 对外文档与规范 |

## 知识库状态

```yaml
kb_version: 2.3.0
最后更新: 2026-03-20 19:14
模块数量: 16
待执行方案: 0
```

## 读取指引

```yaml
启动任务:
  1. 读取本文件获取导航
  2. 读取 context.md 获取项目上下文
  3. 检查 plan/ 是否有进行中方案包

任务相关:
  - 涉及特定模块: 读取 modules/{模块名}.md
  - 需要历史决策: 搜索 CHANGELOG.md → 读取对应 archive/{YYYY-MM}/{方案包}/proposal.md
  - 继续之前任务: 读取 plan/{方案包}/*
```

## 验收检查清单

- [ ] 目录结构完整（INDEX/context/CHANGELOG/modules/archive/plan/sessions）
- [ ] modules/_index.md 覆盖主要模块且依赖关系清晰
- [ ] 每个模块文档包含职责、行为规范、依赖关系
- [ ] context.md 能说明技术栈、范围边界与约束
- [ ] CHANGELOG.md 有知识库初始化记录

## 风险/缺口清单

| 缺口/风险 | 影响 | 备注 |
|-----------|------|------|
| 缺少自动化测试说明 | 影响质量验收可追溯性 | README 未明确测试框架 |
| 规则/模板与实际代码同步风险 | 可能导致文档漂移 | 需在后续变更中持续同步 |
| 子代理调用受 CLI 能力限制 | 复杂任务并行效率下降 | 需结合实际 CLI 能力调整 |

## 改进建议

- 在 README 中补充测试/验证流程或最小验证路径
- 将核心模块的公共接口统一在 modules/* 中标注并在代码中注释对应入口
- 为常用命令增加示例工作流与最小可复现案例
