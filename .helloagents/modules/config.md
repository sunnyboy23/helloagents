# config

## 职责

管理 CLI 目标的配置写入（Codex/Claude 等）、Hook 配置与权限设置，负责规则文件的部署与移除。

## 接口定义（可选）

### 公共API
| 函数/方法 | 参数 | 返回值 | 说明 |
|----------|------|--------|------|
| _configure_codex_toml | path | None | 配置 Codex CLI config.toml |
| _configure_claude_hooks | path | None | 配置 Claude Hooks |
| _deploy_claude_rules | path | None | 部署 Claude 分离规则 |

## 行为规范

### 配置写入
**条件**: 安装/更新流程触发
**行为**: 写入配置文件、添加/移除 hook 与权限
**结果**: 目标 CLI 正确加载 HelloAGENTS

## 依赖关系

```yaml
依赖: [hooks, templates]
被依赖: [installer, updater]
```
