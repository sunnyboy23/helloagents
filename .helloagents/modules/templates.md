# templates

## 职责

提供知识库、方案包与参考文档模板，确保生成结构一致。

## 接口定义（可选）

### 公共API
| 模板 | 说明 |
|------|------|
| templates/INDEX.md | 知识库入口模板 |
| templates/context.md | 项目上下文模板 |
| templates/modules/module.md | 模块文档模板 |
| templates/plan/* | 方案包模板 |

## 行为规范

### 模板降级
**条件**: 模板缺失或读取失败
**行为**: 使用内置默认结构生成
**结果**: 输出提示并继续执行

## 依赖关系

```yaml
依赖: []
被依赖: [services, scripts]
```
