# rlm

## 职责

定义角色子代理体系（reviewer/synthesizer/kb_keeper/pkg_keeper/writer），提供会话与共享任务管理能力。

## 接口定义（可选）

### 公共API
| 函数/方法 | 参数 | 返回值 | 说明 |
|----------|------|--------|------|
| session.py | args | 输出 | RLM 会话管理 |
| shared_tasks.py | args | 输出 | 多终端共享任务 |

## 行为规范

### 角色映射
**条件**: 阶段文件标记 [RLM:角色]
**行为**: 加载角色预设并调用相应子代理
**结果**: 角色化执行并记录结果

## 依赖关系

```yaml
依赖: [services]
被依赖: [stages, functions]
```
