# services

## 职责

定义 KnowledgeService/PackageService/TemplateService/MemoryService/AttentionService 等领域服务，规范知识库与方案包的创建、同步和归档行为。

## 接口定义（可选）

### 公共API
| 服务 | 说明 |
|------|------|
| KnowledgeService | 知识库创建/同步/验证 |
| PackageService | 方案包创建/更新/归档 |
| TemplateService | 模板读取与降级策略 |
| MemoryService | L0/L2 记忆管理 |
| AttentionService | 进度快照输出 |

## 行为规范

### 知识库同步
**条件**: 开发实施阶段完成变更
**行为**: 基于代码更新 modules/context/INDEX
**结果**: 知识库与代码保持一致

## 依赖关系

```yaml
依赖: [templates]
被依赖: [stages, rlm, functions]
```
