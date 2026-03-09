# TypeORM 아키텍처 가이드

이 문서는 NestJS와 TypeORM을 사용한 새로운 아키텍처에 대한 가이드입니다.

## 📁 프로젝트 구조

```
src/
├── entities/                 # TypeORM 엔티티 정의
│   ├── user.entity.ts        # 사용자 엔티티
│   ├── travel.entity.ts      # 여행 엔티티
│   ├── travel-member.entity.ts # 여행 멤버 엔티티
│   ├── travel-expense.entity.ts # 여행 지출 엔티티
│   ├── travel-expense-participant.entity.ts # 지출 참가자 엔티티
│   └── index.ts              # 엔티티 내보내기
├── repositories/             # Repository 패턴 구현
│   ├── base.repository.ts    # 기본 Repository 클래스
│   ├── user.repository.ts    # 사용자 Repository
│   ├── travel.repository.ts  # 여행 Repository
│   ├── travel-member.repository.ts # 여행 멤버 Repository
│   ├── travel-expense.repository.ts # 여행 지출 Repository
│   ├── travel-expense-participant.repository.ts # 지출 참가자 Repository
│   └── index.ts              # Repository 내보내기
├── modules/
│   ├── database/             # 데이터베이스 모듈
│   │   └── database.module.ts # TypeORM 설정 및 Repository 제공
│   └── user/                 # 사용자 모듈 (TypeORM 예제)
│       ├── user.controller.ts # 사용자 컨트롤러
│       ├── user.service.ts   # 사용자 서비스
│       └── user.module.ts    # 사용자 모듈
├── config/
│   └── database.config.ts    # TypeORM 설정
├── migrations/               # 데이터베이스 마이그레이션
│   └── 1734587400000-CreateInitialTables.ts
└── ormconfig.ts              # TypeORM CLI 설정
```

## 🏗️ 아키텍처 개요

### 1. 엔티티 (Entities)
TypeORM 엔티티는 데이터베이스 테이블과 1:1 매핑되는 클래스입니다.

```typescript
// user.entity.ts 예시
@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  // ... 기타 필드들

  @OneToMany(() => Travel, (travel) => travel.user)
  travels: any[];
}
```

**주요 특징:**
- 데코레이터를 사용한 메타데이터 정의
- 관계 설정 (OneToMany, ManyToOne, ManyToMany)
- 인덱스 및 제약 조건 설정

### 2. Repository 패턴
Repository는 데이터 액세스 로직을 캡슐화하고 비즈니스 로직과 분리합니다.

```typescript
// base.repository.ts - 공통 CRUD 기능
export abstract class BaseRepository<T> {
  async create(data: DeepPartial<T>): Promise<T>
  async findById(id: string): Promise<T | null>
  async update(id: string, data: QueryDeepPartialEntity<T>): Promise<T | null>
  async delete(id: string): Promise<boolean>
  // ... 기타 공통 메서드들
}

// user.repository.ts - 특화된 사용자 쿼리
export class UserRepository extends BaseRepository<User> {
  async findByEmail(email: string): Promise<User | null>
  async findByUsername(username: string): Promise<User | null>
  async searchUsers(searchTerm: string): Promise<User[]>
  // ... 사용자 특화 메서드들
}
```

**장점:**
- 코드 재사용성
- 테스트 용이성
- 관심사 분리
- 타입 안정성

### 3. 서비스 계층
비즈니스 로직을 처리하고 Repository를 사용해 데이터를 조작합니다.

```typescript
@Injectable()
export class UserService {
  constructor(
    private readonly userRepository: UserRepository,
  ) {}

  async createUser(dto: CreateUserDto): Promise<User> {
    // 비즈니스 로직: 이메일 중복 체크
    const emailExists = await this.userRepository.isEmailTaken(dto.email);
    if (emailExists) {
      throw new ConflictException('Email already exists');
    }

    // 데이터 변환 및 저장
    const password_hash = await bcrypt.hash(dto.password, 10);
    return this.userRepository.create({
      ...dto,
      password_hash,
    });
  }
}
```

### 4. 모듈 구조
NestJS의 모듈 시스템을 활용한 의존성 주입:

```typescript
@Module({
  imports: [DatabaseModule], // Repository 제공
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
```

## 🔄 데이터 플로우

1. **Controller** → HTTP 요청 처리 및 DTO 검증
2. **Service** → 비즈니스 로직 처리
3. **Repository** → 데이터베이스 쿼리 실행
4. **Entity** → 타입 안전한 데이터 모델

```
HTTP Request → Controller → Service → Repository → Database
                    ↓           ↓          ↓
                   DTO    Business Logic  Entity
```

## 🛠️ TypeORM CLI 명령어

```bash
# 마이그레이션 생성
npm run migration:generate -- src/migrations/AddNewColumn

# 빈 마이그레이션 생성
npm run migration:create -- src/migrations/CreateIndex

# 마이그레이션 실행
npm run migration:run

# 마이그레이션 되돌리기
npm run migration:revert

# 마이그레이션 상태 확인
npm run migration:show
```

## 🚀 Migration 가이드

### 새로운 엔티티 추가 시
1. 엔티티 파일 생성 (`src/entities/new-entity.entity.ts`)
2. Repository 생성 (`src/repositories/new-entity.repository.ts`)
3. 마이그레이션 생성: `npm run migration:generate -- src/migrations/AddNewEntity`
4. 마이그레이션 실행: `npm run migration:run`

### 기존 엔티티 수정 시
1. 엔티티 파일 수정
2. 마이그레이션 생성: `npm run migration:generate -- src/migrations/UpdateEntity`
3. 마이그레이션 검토 후 실행

## 📊 성능 최적화

### 1. 쿼리 최적화
```typescript
// N+1 문제 해결: 관계 데이터를 한 번에 로드
const travels = await this.travelRepository.find({
  relations: ['user', 'members', 'expenses'],
});

// 선택적 필드 로드
const users = await this.userRepository
  .createQueryBuilder('user')
  .select(['user.id', 'user.email', 'user.name'])
  .where('user.role = :role', { role: 'admin' })
  .getMany();
```

### 2. 인덱스 설정
```typescript
@Entity('users')
@Index(['email'], { unique: true })
@Index(['username'], { unique: true })
export class User {
  // ...
}
```

### 3. 연결 풀 설정
```typescript
// database.config.ts
extra: {
  max: env.nodeEnv === 'production' ? 20 : 10,
  min: env.nodeEnv === 'production' ? 2 : 0,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
}
```

## 🔒 보안 고려사항

### 1. 비밀번호 해싱
```typescript
const password_hash = await bcrypt.hash(password, 10);
```

### 2. SQL 인젝션 방지
```typescript
// ✅ 안전한 방법: 매개변수화된 쿼리
const user = await this.userRepository
  .createQueryBuilder('user')
  .where('user.email = :email', { email })
  .getOne();

// ❌ 위험한 방법: 문자열 연결
const user = await this.userRepository.query(
  `SELECT * FROM users WHERE email = '${email}'`
);
```

### 3. 데이터 검증
```typescript
// DTO에서 class-validator 사용
export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;
}
```

## 📝 베스트 프랙티스

### 1. Repository 네이밍
- 엔티티별 Repository: `UserRepository`, `TravelRepository`
- 메서드명: `findByEmail`, `updatePassword`, `deleteUser`

### 2. 트랜잭션 사용
```typescript
await this.repository.manager.transaction(async (manager) => {
  await manager.save(user);
  await manager.save(profile);
});
```

### 3. 에러 처리
```typescript
try {
  return await this.userRepository.create(userData);
} catch (error) {
  if (error.code === '23505') { // Unique constraint violation
    throw new ConflictException('User already exists');
  }
  throw new InternalServerErrorException('Failed to create user');
}
```

### 4. 로깅
```typescript
this.logger.log(`User created: ${user.email} (${user.id})`);
this.logger.error(`Failed to create user: ${error.message}`, error.stack);
```

## 🔄 기존 코드 마이그레이션

기존 PostgreSQL pool을 사용하는 코드를 TypeORM으로 마이그레이션하는 단계:

1. **엔티티 정의**: 기존 테이블 구조를 TypeORM 엔티티로 변환
2. **Repository 생성**: SQL 쿼리를 Repository 메서드로 변환
3. **서비스 수정**: pool.query() 호출을 Repository 메서드 호출로 변경
4. **테스트**: 기존 기능이 정상 동작하는지 확인

### 변환 예시
```typescript
// 기존 코드 (PostgreSQL pool)
const result = await pool.query(
  'SELECT * FROM users WHERE email = $1',
  [email]
);

// 새로운 코드 (TypeORM)
const user = await this.userRepository.findByEmail(email);
```

이 아키텍처는 확장 가능하고 유지보수하기 쉬운 코드베이스를 제공하며, TypeScript의 타입 안전성과 TypeORM의 강력한 기능을 활용할 수 있습니다.