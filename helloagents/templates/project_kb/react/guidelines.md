# React 项目编码规范

> 此文件由 HelloAGENTS 全栈模式自动生成

## 代码风格

### 组件规范

```tsx
// 推荐：函数组件 + TypeScript
import { useState, useCallback, memo } from 'react';
import type { FC } from 'react';

interface ComponentProps {
  // Props 类型定义
}

export const Component: FC<ComponentProps> = memo(({ prop1, prop2 }) => {
  // 组件实现
});

Component.displayName = 'Component';
```

### Hooks 使用

- 使用 `useCallback` 包装事件处理函数
- 使用 `useMemo` 缓存计算结果
- 自定义 Hook 以 `use` 开头命名
- 遵循 Hooks 调用规则

### 状态管理

- 组件内状态使用 `useState`
- 跨组件状态使用 Zustand/Redux
- 服务端状态使用 React Query/SWR

## 命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 组件 | PascalCase | UserCard |
| Hooks | camelCase + use前缀 | useUser |
| 工具函数 | camelCase | formatDate |
| 常量 | UPPER_SNAKE_CASE | MAX_SIZE |
| 类型 | PascalCase | UserProps |

## 文件组织

```
feature/
├── components/
│   ├── ComponentName/
│   │   ├── index.tsx
│   │   ├── ComponentName.tsx
│   │   ├── ComponentName.test.tsx
│   │   └── ComponentName.module.css
├── hooks/
│   └── useFeatureHook.ts
├── services/
│   └── featureService.ts
└── types.ts
```

## 样式规范

- 优先使用 TailwindCSS 工具类
- 复杂样式使用 CSS Modules
- 避免内联样式
- 响应式设计：mobile-first

## 测试规范

- 组件测试使用 React Testing Library
- 测试用户行为而非实现细节
- 覆盖核心业务逻辑
- Mock 外部依赖

## 性能优化

- 使用 `React.memo` 避免不必要的重渲染
- 图片使用懒加载
- 路由使用 `React.lazy` 代码分割
- 避免在渲染中创建新对象/函数

## Git 提交规范

```
<type>(<scope>): <subject>

类型: feat, fix, docs, style, refactor, test, chore
范围: 功能模块名
描述: 简短说明
```
