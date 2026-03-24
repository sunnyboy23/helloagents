# installer

## 职责

负责将 HelloAGENTS 安装/卸载到目标 CLI（Claude/Codex/Gemini 等），部署规则文件、技能、子代理定义与必要配置。

## 接口定义（可选）

### 公共API
| 函数/方法 | 参数 | 返回值 | 说明 |
|----------|------|--------|------|
| install | target | bool | 安装到指定 CLI 目标 |
| uninstall | target | bool | 卸载指定 CLI 目标 |

## 行为规范

### 安装流程
**条件**: 用户选择 install 或交互式安装
**行为**: 清理旧版本残留、部署规则/插件、配置权限与 hooks
**结果**: 目标 CLI 可识别 HelloAGENTS 规则

### 卸载流程
**条件**: 用户选择 uninstall
**行为**: 移除规则与插件文件、清理残留
**结果**: 目标 CLI 恢复原始状态

## 依赖关系

```yaml
依赖: [config, platform-win]
被依赖: [core-cli]
```
