# 项目技术上下文

> 此文件由 HelloAGENTS 全栈模式自动生成

## 项目信息

```yaml
project_name: {项目名称}
project_type: backend-python
created_at: {创建时间}
engineer_id: {工程师ID}
```

## 技术栈

```yaml
tech_stack:
  declared:
    - fastapi
    - sqlalchemy
    - postgresql
  detected:
    # 由技术栈扫描器自动填充
  effective:
    # declared + detected 合并后的最终列表
```

## 框架版本

| 框架/库 | 版本 | 说明 |
|---------|------|------|
| FastAPI | 0.100+ | Web 框架 |
| SQLAlchemy | 2.x | ORM |
| Pydantic | 2.x | 数据验证 |
| PostgreSQL | 15.x | 数据库 |
| Redis | 7.x | 缓存 |
| Celery | 5.x | 异步任务 |

## 项目结构

```
app/
├── api/
│   └── v1/
│       ├── endpoints/
│       └── router.py
├── core/
│   ├── config.py
│   ├── security.py
│   └── deps.py
├── models/
├── schemas/
├── services/
├── db/
└── main.py
```

## 环境配置

| 环境 | 数据库 | Redis | 说明 |
|------|--------|-------|------|
| dev | localhost:5432 | localhost:6379 | 本地开发 |
| test | test-db:5432 | test-redis:6379 | 测试环境 |
| prod | prod-db:5432 | prod-redis:6379 | 生产环境 |

## 外部依赖

### 下游消费者

| 服务/客户端 | 用途 |
|------------|------|
| BFF | 接口聚合 |

### 上游服务

| 服务 | 用途 |
|------|------|
| - | - |

## 备注

{其他需要说明的上下文信息}
