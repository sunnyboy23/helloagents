# 模块索引

> 通过此文件快速定位模块文档

## 模块清单

| 模块 | 职责 | 状态 | 文档 |
|------|------|------|------|
| core-cli | CLI 入口与交互菜单 | ✅ | [core-cli.md](./core-cli.md) |
| installer | 安装/卸载与部署 | ✅ | [installer.md](./installer.md) |
| updater | 更新/状态/清理 | ✅ | [updater.md](./updater.md) |
| version-check | 版本检测与缓存 | ✅ | [version-check.md](./version-check.md) |
| config | 配置与权限/Hook 管理 | ✅ | [config.md](./config.md) |
| platform-win | Windows 专用辅助 | ✅ | [platform-win.md](./platform-win.md) |
| rlm | 角色与会话管理 | ✅ | [rlm.md](./rlm.md) |
| services | 领域服务定义 | ✅ | [services.md](./services.md) |
| stages | 方案设计与实施阶段 | ✅ | [stages.md](./stages.md) |
| rules | 规则与约束集合 | ✅ | [rules.md](./rules.md) |
| functions | 内置命令模块 | ✅ | [functions.md](./functions.md) |
| scripts | CLI 脚本工具 | ✅ | [scripts.md](./scripts.md) |
| templates | 文档模板 | ✅ | [templates.md](./templates.md) |
| hooks | Hook 配置参考 | ✅ | [hooks.md](./hooks.md) |
| distribution | 发布与安装入口 | ✅ | [distribution.md](./distribution.md) |
| docs | 对外文档 | ✅ | [docs.md](./docs.md) |

## 模块依赖关系

```
core-cli → installer → config → hooks
core-cli → updater → version-check
installer → platform-win
updater → platform-win
services → templates
stages → services → rules
functions → rules
scripts → templates
hooks → config
rlm → services
```

## 状态说明
- ✅ 稳定
- 🚧 开发中
- 📝 规划中
