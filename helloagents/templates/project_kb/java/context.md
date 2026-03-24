# 项目技术上下文

> 此文件由 HelloAGENTS 全栈模式自动生成

## 项目信息

```yaml
project_name: {项目名称}
project_type: backend-java
created_at: {创建时间}
engineer_id: {工程师ID}
```

## 技术栈

```yaml
tech_stack:
  declared:
    - spring-boot@3
    - mybatis-plus
    - mysql
  detected:
    # 由技术栈扫描器自动填充
  effective:
    # declared + detected 合并后的最终列表
```

## 框架版本

| 框架/库 | 版本 | 说明 |
|---------|------|------|
| Spring Boot | 3.x | 核心框架 |
| MyBatis-Plus | 3.5.x | ORM 框架 |
| MySQL | 8.x | 数据库 |
| Redis | 7.x | 缓存 |
| Lombok | - | 代码简化 |
| MapStruct | - | 对象映射 |

## 项目结构

```
src/main/java/com/example/
├── controller/      # 控制器层
├── service/         # 服务层
│   └── impl/
├── mapper/          # 数据访问层
├── entity/          # 实体类
├── dto/             # 数据传输对象
├── vo/              # 视图对象
├── config/          # 配置类
├── common/          # 公共组件
└── Application.java
```

## 环境配置

| 环境 | 数据库 | Redis | 说明 |
|------|--------|-------|------|
| dev | localhost:3306 | localhost:6379 | 本地开发 |
| test | test-db:3306 | test-redis:6379 | 测试环境 |
| prod | prod-db:3306 | prod-redis:6379 | 生产环境 |

## 外部依赖

### 下游消费者

| 服务/客户端 | 用途 |
|------------|------|
| BFF | 接口聚合 |
| 前端应用 | 用户界面 |
| 移动端应用 | 移动端 |

### 上游服务

| 服务 | 用途 |
|------|------|
| - | - |

## 备注

{其他需要说明的上下文信息}
