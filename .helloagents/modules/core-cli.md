# core-cli

## 职责

CLI 主入口与交互式菜单，负责解析用户输入、展示安装/更新菜单，以及作为各功能模块的协调入口。

## 接口定义（可选）

### 公共API
| 函数/方法 | 参数 | 返回值 | 说明 |
|----------|------|--------|------|
| main | argv | None | CLI 主入口（python -m helloagents） |
| _interactive_main | - | None | 交互式菜单入口 |

## 行为规范

### 交互菜单
**条件**: 直接运行 helloagents 命令且无子命令
**行为**: 展示安装/卸载/更新/状态/清理菜单并引导执行
**结果**: 将具体操作交由 installer/updater 模块完成

### 语言选择
**条件**: 检测系统 locale
**行为**: 自动选择中文或英文提示
**结果**: CLI 输出与系统语言匹配

## 依赖关系

```yaml
依赖: [installer, updater, config, interactive]
被依赖: [distribution]
```
