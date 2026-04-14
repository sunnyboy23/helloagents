# Java/Spring Boot 项目编码规范

> 此文件由 HelloAGENTS 全栈模式自动生成

## 代码风格

### 分层架构

```
Controller → Service → Mapper → Database
    ↓           ↓
   VO         Entity
    ↑           ↓
   DTO ←────────┘
```

### 控制器规范

```java
@RestController
@RequestMapping("/api/v1/users")
@RequiredArgsConstructor
public class UserController {
    private final UserService userService;

    @GetMapping("/{id}")
    public Result<UserVO> getUser(@PathVariable Long id) {
        return Result.success(userService.getUserById(id));
    }

    @PostMapping
    public Result<Long> createUser(@Valid @RequestBody CreateUserDTO dto) {
        return Result.success(userService.createUser(dto));
    }
}
```

### 服务层规范

```java
@Service
@RequiredArgsConstructor
public class UserServiceImpl implements UserService {
    private final UserMapper userMapper;

    @Override
    @Transactional(readOnly = true)
    public UserVO getUserById(Long id) {
        User user = userMapper.selectById(id);
        if (user == null) {
            throw new BusinessException("用户不存在");
        }
        return UserConverter.INSTANCE.toVO(user);
    }
}
```

## 命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 控制器 | XxxController | UserController |
| 服务接口 | XxxService | UserService |
| 服务实现 | XxxServiceImpl | UserServiceImpl |
| 数据访问 | XxxMapper | UserMapper |
| 实体类 | Xxx（单数） | User |
| VO | XxxVO | UserVO |
| DTO | XxxDTO | CreateUserDTO |
| 请求对象 | XxxRequest | CreateUserRequest |
| 转换器 | XxxConverter | UserConverter |

## 异常处理

```java
// 业务异常
public class BusinessException extends RuntimeException {
    private final String code;
    private final String message;
}

// 全局异常处理
@RestControllerAdvice
public class GlobalExceptionHandler {
    @ExceptionHandler(BusinessException.class)
    public Result<?> handleBusinessException(BusinessException e) {
        return Result.fail(e.getCode(), e.getMessage());
    }
}
```

## 数据库规范

- 表名使用下划线命名：`t_user`
- 字段名使用下划线命名：`user_name`
- 必须有 `id`, `create_time`, `update_time`
- 使用逻辑删除：`deleted`
- 索引命名：`idx_表名_字段名`

## 接口规范

- RESTful 风格
- 统一响应格式：`Result<T>`
- 分页使用 `PageResult<T>`
- 版本控制：`/api/v1/...`

## 日志规范

```java
@Slf4j
public class UserServiceImpl {
    public void doSomething() {
        log.info("操作描述, userId={}", userId);
        log.error("错误描述, userId={}", userId, e);
    }
}
```

## 测试规范

- 单元测试覆盖核心业务逻辑
- 使用 Mockito 模拟依赖
- 集成测试使用 H2 内存数据库
- 测试类命名：`XxxTest` / `XxxIntegrationTest`

## Git 提交规范

```
<type>(<scope>): <subject>

类型: feat, fix, docs, style, refactor, test, chore
范围: 模块名
描述: 简短说明
```
