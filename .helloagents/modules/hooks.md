# hooks

## 职责

提供 Claude/Codex 等 CLI 的 Hook 配置参考与生命周期事件说明。

## 接口定义（可选）

### 公共API
| 文件 | 说明 |
|------|------|
| hooks/claude_code_hooks.toml | Claude Code Hook 配置示例 |
| hooks/codex_cli_hooks.toml | Codex CLI Hook 配置示例 |
| hooks/hooks_reference.md | Hook 能力矩阵与参考 |

## 行为规范

### Hook 安装
**条件**: 安装或升级 HelloAGENTS
**行为**: 按配置文件写入 Hook 设置
**结果**: CLI 自动注入上下文与验证流程

## 依赖关系

```yaml
依赖: []
被依赖: [config]
```
