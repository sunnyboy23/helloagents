# distribution

## 职责

负责包发布与安装入口，包括 npm/npx 启动脚本、pip/uv 发布元数据与安装脚本。

## 接口定义（可选）

### 公共API
| 文件 | 说明 |
|------|------|
| package.json | npm 包信息与 bin 入口 |
| pyproject.toml | Python 包元数据 |
| bin/cli.mjs | npx 引导安装器 |
| install.sh / install.ps1 | 一键安装脚本 |

## 行为规范

### npx 安装
**条件**: 执行 npx helloagents
**行为**: 检测 Python → pip 安装包 → 转发到原生 CLI
**结果**: 完成首次安装并进入交互式菜单

## 依赖关系

```yaml
依赖: [core-cli]
被依赖: [docs]
```
