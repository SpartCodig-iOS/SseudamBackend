# 🚀 성능 및 기타 개선 사항

## 1. Redis 성능 개선 (High Priority)

### 현재 문제: KEYS 명령어 사용
```typescript
// src/services/cacheService.ts - 라인 196-200 (위험!)
const keys = await redis.keys(pattern);
if (keys.length > 0) {
  deletedCount = await redis.del(...keys);
}
```

### 개선 방안: SCAN 사용
```typescript
// src/services/cacheService.ts
async delPattern(pattern: string): Promise<number> {
  let deletedCount = 0;
  let cursor = '0';

  do {
    const result = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
    cursor = result[0];
    const keys = result[1];

    if (keys.length > 0) {
      const deleted = await this.redis.del(...keys);
      deletedCount += deleted;
    }
  } while (cursor !== '0');

  return deletedCount;
}
```

## 2. 메모리 캐시 최적화 (Medium Priority)

### 현재 문제: 무제한 증가하는 Map 캐시들
```typescript
// AuthService, AuthGuard에서 여러 Map 캐시 사용
private readonly identifierCache = new Map<string, { email: string; expiresAt: number }>();
private readonly bcryptCache = new Map<string, { hash: string; expiresAt: number }>();
```

### 개선 방안: LRU 캐시 사용
```typescript
import { LRUCache } from 'lru-cache';

@Injectable()
export class OptimizedCacheService {
  private readonly identifierCache = new LRUCache<string, string>({
    max: 1000,
    ttl: 5 * 60 * 1000, // 5분
  });

  private readonly roleCache = new LRUCache<string, UserRole>({
    max: 5000,
    ttl: 10 * 60 * 1000, // 10분
  });

  async getOrSetIdentifier(key: string, fetcher: () => Promise<string>): Promise<string> {
    const cached = this.identifierCache.get(key);
    if (cached) return cached;

    const value = await fetcher();
    this.identifierCache.set(key, value);
    return value;
  }
}
```

## 3. 데이터베이스 쿼리 최적화 (Medium Priority)

### 현재 문제: N+1 쿼리
```typescript
// 여행 목록 조회 시 각 여행마다 별도 쿼리
const travels = await this.travelRepository.find();
for (const travel of travels) {
  travel.memberCount = await this.memberRepository.count({ travelId: travel.id });
}
```

### 개선 방안: JOIN 또는 집계 쿼리 사용
```typescript
// Repository에서 한 번에 조회
async findTravelsWithCounts(userId: string): Promise<TravelWithCounts[]> {
  return this.repository
    .createQueryBuilder('travel')
    .leftJoin('travel.members', 'member')
    .leftJoin('travel.expenses', 'expense')
    .select([
      'travel.*',
      'COUNT(DISTINCT member.id) as memberCount',
      'COUNT(DISTINCT expense.id) as expenseCount',
      'COALESCE(SUM(expense.convertedAmount), 0) as totalAmount'
    ])
    .where('travel.ownerId = :userId OR member.userId = :userId', { userId })
    .groupBy('travel.id')
    .getRawMany();
}
```

## 4. 환경별 설정 최적화 (Medium Priority)

### 현재 문제: 환경별 차이가 없음
```typescript
// 모든 환경에서 동일한 설정
const config = {
  max: env.nodeEnv === 'production' ? 20 : 10,
  // ...
};
```

### 개선 방안: 환경별 최적화
```typescript
// src/config/environment-configs.ts
export const getDatabaseConfig = () => {
  const baseConfig = {
    type: 'postgres' as const,
    entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  };

  switch (env.nodeEnv) {
    case 'production':
      return {
        ...baseConfig,
        logging: ['error'],
        extra: {
          max: 20,
          min: 2,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 5000,
        },
        synchronize: false,
      };

    case 'staging':
      return {
        ...baseConfig,
        logging: ['error', 'warn'],
        extra: {
          max: 10,
          min: 1,
          idleTimeoutMillis: 20000,
        },
        synchronize: false,
      };

    case 'development':
      return {
        ...baseConfig,
        logging: ['query', 'error', 'warn'],
        extra: {
          max: 5,
          min: 0,
          idleTimeoutMillis: 10000,
        },
        synchronize: true,
        dropSchema: false,
      };

    case 'test':
      return {
        ...baseConfig,
        logging: false,
        extra: {
          max: 3,
          min: 0,
        },
        synchronize: true,
        dropSchema: true, // 테스트마다 스키마 초기화
      };

    default:
      throw new Error(`Unknown environment: ${env.nodeEnv}`);
  }
};
```

## 5. API 응답 최적화 (Medium Priority)

### 현재 문제: 불필요한 데이터 전송
```typescript
// 전체 User 객체 반환
return {
  user: fullUserObject, // password_hash 등 민감한 정보 포함
  tokenPair,
};
```

### 개선 방안: DTO 변환
```typescript
// src/modules/auth/dto/user-profile.dto.ts
export class UserProfileDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  name: string | null;

  @ApiProperty()
  avatarUrl: string | null;

  @ApiProperty()
  role: UserRole;

  @ApiProperty()
  createdAt: Date;

  static fromEntity(user: User): UserProfileDto {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatar_url,
      role: user.role,
      createdAt: user.created_at,
    };
  }
}

// 사용
return {
  user: UserProfileDto.fromEntity(user),
  tokenPair,
};
```

## 6. 로깅 및 모니터링 개선 (Medium Priority)

### 현재 문제: 일관성 없는 로깅
```typescript
console.log('Debug message'); // 프로덕션에 남아있음
this.logger.debug('Some debug'); // 일부에서만 사용
```

### 개선 방안: 구조화된 로깅
```typescript
// src/common/logger/app-logger.service.ts
@Injectable()
export class AppLogger {
  private readonly logger = new Logger();

  logAuthSuccess(userId: string, method: string, duration: number) {
    this.logger.log('Authentication successful', {
      userId,
      method,
      duration,
      timestamp: new Date().toISOString(),
    });
  }

  logAuthFailure(identifier: string, reason: string, ip?: string) {
    this.logger.warn('Authentication failed', {
      identifier: this.maskEmail(identifier),
      reason,
      ip,
      timestamp: new Date().toISOString(),
    });
  }

  logDatabaseQuery(query: string, duration: number) {
    if (env.nodeEnv === 'development') {
      this.logger.debug('Database query executed', {
        query: query.substring(0, 100), // 쿼리 일부만
        duration,
      });
    }
  }

  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    return `${local.substring(0, 2)}***@${domain}`;
  }
}
```

## 7. 에러 처리 표준화 (High Priority)

### 현재 문제: 불일치하는 에러 응답
```typescript
// 여러 곳에서 다른 형태의 에러 반환
throw new Error('User not found');
throw new UnauthorizedException('Invalid credentials');
return { error: 'Something went wrong' };
```

### 개선 방안: 표준화된 에러 응답
```typescript
// src/common/exceptions/business.exceptions.ts
export class BusinessException extends HttpException {
  constructor(
    message: string,
    code: string,
    statusCode: HttpStatus = HttpStatus.BAD_REQUEST,
    details?: any
  ) {
    super(
      {
        message,
        code,
        details,
        timestamp: new Date().toISOString(),
      },
      statusCode
    );
  }
}

export class UserNotFoundError extends BusinessException {
  constructor(identifier: string) {
    super(
      'User not found',
      'USER_NOT_FOUND',
      HttpStatus.NOT_FOUND,
      { identifier }
    );
  }
}

export class InvalidCredentialsError extends BusinessException {
  constructor() {
    super(
      'Invalid email or password',
      'INVALID_CREDENTIALS',
      HttpStatus.UNAUTHORIZED
    );
  }
}

// 사용
if (!user) {
  throw new UserNotFoundError(identifier);
}

if (!isValidPassword) {
  throw new InvalidCredentialsError();
}
```

## 8. 배포 및 운영 개선 (Medium Priority)

### Dockerfile 최적화
```dockerfile
# 현재 문제: 최적화되지 않은 이미지
FROM node:18

# 개선된 Dockerfile
FROM node:18-alpine AS builder

WORKDIR /app

# 종속성 먼저 복사 (캐시 활용)
COPY package*.json ./
RUN npm ci --only=production

# 소스 코드 복사 및 빌드
COPY . .
RUN npm run build

# 프로덕션 이미지
FROM node:18-alpine AS production

RUN addgroup -g 1001 -S nodejs
RUN adduser -S nestjs -u 1001

WORKDIR /app

# 빌드된 파일과 종속성만 복사
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/package.json ./package.json

USER nestjs

EXPOSE 3000

CMD ["node", "dist/main.js"]
```

### Health Check 엔드포인트 개선
```typescript
// src/modules/health/health.controller.ts
@Get('/health')
@ApiOperation({ summary: 'Application health check' })
async getHealth(): Promise<HealthStatus> {
  const checks = await Promise.allSettled([
    this.checkDatabase(),
    this.checkRedis(),
    this.checkExternalServices(),
  ]);

  const status = checks.every(check => check.status === 'fulfilled')
    ? 'healthy'
    : 'unhealthy';

  return {
    status,
    timestamp: new Date().toISOString(),
    version: process.env.APP_VERSION || 'unknown',
    uptime: process.uptime(),
    checks: {
      database: checks[0].status === 'fulfilled',
      redis: checks[1].status === 'fulfilled',
      external: checks[2].status === 'fulfilled',
    },
  };
}
```