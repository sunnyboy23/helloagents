---
name: ~fullstack
description: 全栈协同命令 — 在新 bootstrap/skills 架构下桥接 legacy `functions/fullstack.md` 与 `services/fullstack.md`（~fullstack / ~fs 命令）
policy:
  allow_implicit_invocation: false
---
Trigger: ~fullstack [subcommand] | ~fs [subcommand]

`~fullstack` 是显式命令，不走语义自动选路；它在新的 bootstrap + skills 体系下继续复用既有全栈协议文档，保证全栈模式不因非全栈运行时迁移而失效。

## 执行要求

1. 先读取 `{HELLOAGENTS_READ_ROOT}/functions/fullstack.md`
2. 再读取 `{HELLOAGENTS_READ_ROOT}/services/fullstack.md`
3. 严格按这两个文件中的命令协议、前置条件、子命令说明和状态规则执行
4. 保持全栈命令边界：仅在用户显式输入 `~fullstack` / `~fs` 时启用，不把全栈编排混入普通 `~plan` / `~build` / `~auto` 路径
5. 不要回退去读取已删除的 `stages/design.md` / `stages/develop.md` / `rules/*.md` 旧路径；全栈命令所需规范以当前存在的 `functions/fullstack.md`、`services/fullstack.md` 与相关脚本为准

## 兼容目标

- 非全栈路径继续遵循 bootstrap / command skills 新体系
- 全栈路径继续由 `functions/fullstack.md` + `services/fullstack.md` 驱动
- `~fs` 视为 `~fullstack` 的兼容别名
