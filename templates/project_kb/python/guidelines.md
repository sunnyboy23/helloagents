# Python/FastAPI 项目编码规范

> 此文件由 HelloAGENTS 全栈模式自动生成

## 代码风格

### 路由规范

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/api/v1/users", tags=["users"])

@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    user = await user_service.get_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return UserResponse.model_validate(user)
```

### Pydantic 模型规范

```python
from pydantic import BaseModel, Field
from datetime import datetime

class UserBase(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: str = Field(..., pattern=r"^[\w\.-]+@[\w\.-]+\.\w+$")

class UserCreate(UserBase):
    password: str = Field(..., min_length=8)

class UserResponse(UserBase):
    id: int
    created_at: datetime

    model_config = {"from_attributes": True}
```

## 命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 路由模块 | 复数小写 | users.py |
| 模型类 | 单数 PascalCase | User |
| Schema | 用途+PascalCase | UserCreate |
| 服务函数 | snake_case | get_user_by_id |
| 常量 | UPPER_SNAKE_CASE | MAX_PAGE_SIZE |

## 异步规范

- 数据库操作使用 async/await
- I/O 密集型操作使用异步
- CPU 密集型操作考虑使用线程池
- 正确使用 `asyncio.gather` 并行执行

## 依赖注入

```python
from fastapi import Depends

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session() as session:
        yield session

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    # 验证逻辑
    pass
```

## 异常处理

```python
from fastapi import HTTPException
from fastapi.responses import JSONResponse

class BusinessException(Exception):
    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message

@app.exception_handler(BusinessException)
async def business_exception_handler(request, exc: BusinessException):
    return JSONResponse(
        status_code=400,
        content={"code": exc.code, "message": exc.message}
    )
```

## 测试规范

- 使用 pytest 和 pytest-asyncio
- 使用 httpx.AsyncClient 测试 API
- Mock 外部依赖
- 使用 fixtures 共享测试数据

## 日志规范

```python
import logging

logger = logging.getLogger(__name__)

async def do_something():
    logger.info("操作描述", extra={"user_id": user_id})
    logger.error("错误描述", exc_info=True)
```

## 类型注解

- 所有函数添加类型注解
- 使用 `typing` 模块的类型
- 复杂类型使用 `TypeAlias`

## Git 提交规范

```
<type>(<scope>): <subject>

类型: feat, fix, docs, style, refactor, test, chore
范围: 模块名
描述: 简短说明
```
