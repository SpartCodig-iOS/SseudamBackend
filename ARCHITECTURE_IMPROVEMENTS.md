# 🏗️ 아키텍처 개선 방안

## 1. 데이터베이스 아키텍처 통합 (Critical)

### 현재 문제
- PostgreSQL Pool (max: 20) + TypeORM (max: 20) = 총 40개 연결
- 같은 DB에 대한 중복 연결 풀
- 일관성 없는 쿼리 방식

### 해결 방안

#### 옵션 A: TypeORM으로 완전 통합 (권장)
```typescript
// 1단계: 기존 pool 쿼리를 TypeORM Repository로 마이그레이션
// 예시: AuthService.authenticateUserDirect()

// 기존 코드 (src/modules/auth/auth.service.ts)
const pool = await getPool();
const result = await pool.query(
  `SELECT id::text, email, password_hash FROM profiles WHERE email = $1`,
  [identifier]
);

// TypeORM으로 변환
const user = await this.userRepository.findOne({
  where: { email: identifier },
  select: ['id', 'email', 'password_hash']
});
```

#### 옵션 B: 단일 Pool 공유
```typescript
// src/config/shared-pool.ts
export class SharedPoolService {
  private static instance: Pool;

  static async getPool(): Promise<Pool> {
    if (!this.instance) {
      this.instance = new Pool(config);
    }
    return this.instance;
  }
}

// TypeORM에서 기존 Pool 재사용
export const createDatabaseConfig = async (): Promise<TypeOrmModuleOptions> => {
  const existingPool = await SharedPoolService.getPool();

  return {
    type: 'postgres',
    extra: {
      pool: existingPool // 기존 pool 재사용
    },
    // ...
  };
};
```

## 2. SharedModule 분해 (High Priority)

### 현재 문제
```typescript
@Global()
@Module({
  providers: [
    AuthService,           // 인증
    AuthGuard,            // 가드
    SocialAuthService,    // OAuth
    OptimizedOAuthService, // OAuth
    RateLimitGuard,       // 보안
    AnalyticsService,     // 분석
    // ... 20+ 서비스들
  ]
})
```

### 개선 방안
```typescript
// src/modules/core/core.module.ts - 핵심 전역 서비스만
@Global()
@Module({
  providers: [
    JwtTokenService,
    CacheService,
    DatabaseService,
  ],
  exports: [
    JwtTokenService,
    CacheService,
    DatabaseService,
  ],
})
export class CoreModule {}

// src/modules/auth/auth.module.ts - 인증 관련 서비스들
@Module({
  providers: [
    AuthService,
    SocialAuthService,
    AuthGuard,
  ],
  exports: [AuthService],
})
export class AuthModule {}

// src/modules/security/security.module.ts - 보안 가드들
@Module({
  providers: [
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard,
    },
  ],
})
export class SecurityModule {}
```

## 3. 서비스 통합 (High Priority)

### 현재 문제: Auth 관련 서비스가 5개
- `AuthService`
- `EnhancedAuthService`
- `AuthTypeOrmAdapter`
- `TypeOrmAuthService`
- `OptimizedDeleteService`

### 개선 방안
```typescript
// src/modules/auth/unified-auth.service.ts
@Injectable()
export class UnifiedAuthService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly sessionService: SessionService,
    private readonly jwtService: JwtTokenService,
  ) {}

  async authenticate(identifier: string, password: string): Promise<User | null> {
    // TypeORM 단일 방식으로 통합
    const user = await this.userRepository.findByEmailOrUsername(identifier);

    if (!user) return null;

    const isValid = await bcrypt.compare(password, user.password_hash);
    return isValid ? user : null;
  }

  async login(input: LoginInput): Promise<AuthSessionPayload> {
    const user = await this.authenticate(input.identifier, input.password);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const session = await this.sessionService.createSession(user.id, 'email');
    const tokenPair = this.jwtService.generateTokenPair(user, 'email', session.sessionId);

    return { user, tokenPair, loginType: 'email', session };
  }

  // signup, refresh, deleteAccount 등 모든 기능 통합
}
```

## 4. 컨트롤러 리팩토링 (Medium Priority)

### 현재 문제
```typescript
// 컨트롤러가 너무 많은 서비스를 주입받음
constructor(
  private readonly authService: AuthService,
  private readonly optimizedDeleteService: OptimizedDeleteService,
  private readonly deviceTokenService: DeviceTokenService,
  private readonly analyticsService: AnalyticsService,
  private readonly jwtTokenService: JwtTokenService,
  private readonly sessionService: SessionService,
) {}
```

### 개선 방안
```typescript
// 단일 책임을 가진 서비스 주입
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: UnifiedAuthService,
    private readonly analyticsService: AnalyticsService, // 필요시에만
  ) {}

  @Post('login')
  async login(@Body() input: LoginInput) {
    const result = await this.authService.login(input);

    // 부수 효과는 백그라운드에서
    setImmediate(() => {
      this.analyticsService.trackLogin(result.user.id);
    });

    return result;
  }
}
```

## 5. 타입 안전성 개선 (Medium Priority)

### any 타입 제거
```typescript
// 기존 (BAD)
(this.originalAuthService as any).authenticateUserDirect(identifier, password);

// 개선 (GOOD)
interface AuthServiceInterface {
  authenticateUser(identifier: string, password: string): Promise<User | null>;
}

@Injectable()
export class UnifiedAuthService implements AuthServiceInterface {
  async authenticateUser(identifier: string, password: string): Promise<User | null> {
    // 명시적 인터페이스 구현
  }
}
```

### DTO 타입 정의
```typescript
// src/modules/auth/dto/auth.dto.ts
export class LoginRequestDto {
  @IsEmail()
  @IsNotEmpty()
  identifier: string;

  @IsString()
  @MinLength(8)
  password: string;
}

export class LoginResponseDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty()
  refreshToken: string;

  @ApiProperty()
  user: UserProfileDto;
}
```

## 6. 환경 설정 개선 (Medium Priority)

### 현재 문제
```typescript
// 프로덕션에서 fallback 값 허용
jwtSecret: process.env.JWT_SECRET ?? 'secret',
```

### 개선 방안
```typescript
// src/config/validated-env.ts
import { IsString, IsInt, Min, Max, validateSync } from 'class-validator';
import { Transform } from 'class-transformer';

export class EnvironmentVariables {
  @IsString()
  NODE_ENV: string;

  @IsString()
  DATABASE_URL: string;

  @IsString()
  JWT_SECRET: string;

  @Transform(({ value }) => parseInt(value))
  @IsInt()
  @Min(1000)
  @Max(86400)
  ACCESS_TOKEN_TTL_SECONDS: number;

  @Transform(({ value }) => parseInt(value))
  @IsInt()
  @Min(3600)
  REFRESH_TOKEN_TTL_SECONDS: number;
}

export function validateEnvironment(config: Record<string, unknown>) {
  const validatedConfig = plainToClass(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  return validatedConfig;
}
```

## 7. 테스트 전략 (High Priority)

### 현재 문제
- 테스트 커버리지 거의 없음
- Jest 대신 node:test 사용

### 개선 방안
```typescript
// package.json 수정
"scripts": {
  "test": "jest",
  "test:watch": "jest --watch",
  "test:cov": "jest --coverage",
  "test:e2e": "jest --config ./test/jest-e2e.json"
}

// src/modules/auth/auth.service.spec.ts
describe('UnifiedAuthService', () => {
  let service: UnifiedAuthService;
  let userRepository: jest.Mocked<UserRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UnifiedAuthService,
        {
          provide: UserRepository,
          useValue: {
            findByEmailOrUsername: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<UnifiedAuthService>(UnifiedAuthService);
    userRepository = module.get(UserRepository);
  });

  describe('authenticate', () => {
    it('should return user when credentials are valid', async () => {
      const mockUser = {
        id: 'test-id',
        email: 'test@example.com',
        password_hash: await bcrypt.hash('password', 10),
      };

      userRepository.findByEmailOrUsername.mockResolvedValue(mockUser);

      const result = await service.authenticate('test@example.com', 'password');

      expect(result).toEqual(mockUser);
      expect(userRepository.findByEmailOrUsername).toHaveBeenCalledWith('test@example.com');
    });

    it('should return null when user not found', async () => {
      userRepository.findByEmailOrUsername.mockResolvedValue(null);

      const result = await service.authenticate('nonexistent@example.com', 'password');

      expect(result).toBeNull();
    });

    it('should return null when password is invalid', async () => {
      const mockUser = {
        id: 'test-id',
        email: 'test@example.com',
        password_hash: await bcrypt.hash('correctpassword', 10),
      };

      userRepository.findByEmailOrUsername.mockResolvedValue(mockUser);

      const result = await service.authenticate('test@example.com', 'wrongpassword');

      expect(result).toBeNull();
    });
  });
});
```