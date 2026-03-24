# functions

## 职责

定义内置命令（~auto/~plan/~exec 等）流程与闸门规则，作为工作流执行入口。

## 接口定义（可选）

### 公共API
| 文件 | 说明 |
|------|------|
| functions/auto.md | 全自动执行 | 
| functions/plan.md | 方案设计流程 |
| functions/exec.md | 执行已有方案包 |
| functions/init.md | 初始化知识库 |
| functions/review.md | 代码审查命令 |

## 行为规范

### 命令闸门
**条件**: 用户输入 ~命令
**行为**: 评估/确认后进入相应阶段
**结果**: 进入 DESIGN/DEVELOP 或直接执行

## 依赖关系

```yaml
依赖: [stages, rules, services]
被依赖: [core-cli]
```
