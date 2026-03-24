# platform-win

## 职责

Windows 平台专用工具集，处理 exe 锁定、延迟清理与安全删除等问题。

## 接口定义（可选）

### 公共API
| 函数/方法 | 参数 | 返回值 | 说明 |
|----------|------|--------|------|
| win_preemptive_unlock | - | bak_path | 更新前解锁 exe |
| win_safe_rmtree | path | bool | Windows 安全删除 |

## 行为规范

### 更新锁处理
**条件**: Windows 平台进行 pip/uv 更新
**行为**: 预先重命名 exe，更新后清理或恢复
**结果**: 降低更新失败概率

## 依赖关系

```yaml
依赖: []
被依赖: [installer, updater]
```
