# scripts

## 职责

提供 CLI 辅助脚本（创建/校验方案包、升级知识库、扫描项目统计等），作为工具层能力。

## 接口定义（可选）

### 公共API
| 脚本 | 说明 |
|------|------|
| create_package.py | 创建方案包目录与模板 |
| validate_package.py | 校验方案包结构 |
| migrate_package.py | 迁移方案包至 archive |
| upgrade_wiki.py | 初始化/升级知识库 |
| project_stats.py | 扫描项目统计 |

## 行为规范

### 脚本调用
**条件**: 规则/阶段触发
**行为**: 使用 python -X utf8 运行并解析 JSON 输出
**结果**: 主流程基于执行报告继续或降级处理

## 依赖关系

```yaml
依赖: [templates]
被依赖: [stages, services]
```
