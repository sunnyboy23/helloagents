# 项目技术上下文

> 此文件由 HelloAGENTS 全栈模式自动生成

## 项目信息

```yaml
project_name: {项目名称}
project_type: frontend-react
created_at: {创建时间}
engineer_id: {工程师ID}
```

## 技术栈

```yaml
tech_stack:
  declared:
    - react@18
    - typescript
  detected:
    # 由技术栈扫描器自动填充
  effective:
    # declared + detected 合并后的最终列表
```

## 框架版本

| 框架/库 | 版本 | 说明 |
|---------|------|------|
| React | 18.x | 核心框架 |
| TypeScript | 5.x | 类型系统 |
| Vite | 5.x | 构建工具 |
| React Router | 6.x | 路由 |
| Zustand/Redux | - | 状态管理 |
| TailwindCSS | 3.x | 样式框架 |

## 项目结构

```
src/
├── components/      # 通用组件
├── features/        # 功能模块
├── hooks/           # 自定义 Hooks
├── services/        # API 服务
├── stores/          # 状态管理
├── utils/           # 工具函数
├── types/           # 类型定义
└── App.tsx
```

## 环境配置

| 环境 | API 地址 | 说明 |
|------|----------|------|
| development | http://localhost:3000 | 本地开发 |
| staging | https://staging-api.example.com | 测试环境 |
| production | https://api.example.com | 生产环境 |

## 外部依赖

### 上游服务

| 服务 | 用途 | API 契约位置 |
|------|------|-------------|
| BFF | 接口聚合 | .helloagents/api/bff_*.md |
| API Gateway | 网关 | .helloagents/api/gateway_*.md |

### 第三方服务

| 服务 | 用途 |
|------|------|
| - | - |

## 备注

{其他需要说明的上下文信息}
