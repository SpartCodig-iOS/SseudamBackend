# Entity Guidelines - 성능 및 품질 가이드라인

## 🎯 목적
Railway DB 스키마 정합성 작업 중 발견된 코드 품질 및 성능 이슈들에 대한 가이드라인

## 📋 주요 패턴 및 주의사항

### 1. **공통 필드 패턴**

#### displayName 필드
```typescript
// ✅ 권장: 공통 인터페이스 사용
import { IHasDisplayName, DisplayNameColumn } from '@common/interfaces/display-name.interface';

export class MyEntity implements IHasDisplayName {
  @DisplayNameColumn()
  displayName!: string | null;
}

// ❌ 비권장: 직접 정의
@Column({ type: 'text', nullable: true, name: 'display_name' })
displayName!: string | null;
```

#### 기본 엔티티 상속
```typescript
// ✅ 권장: BaseEntity 상속
import { BaseEntity } from '@common/entities/base.entity';

export class MyEntity extends BaseEntity {
  // 생성자 자동 제공됨
}

// ❌ 비권장: 중복 생성자
constructor(partial: Partial<MyEntity> = {}) {
  Object.assign(this, partial);
}
```

### 2. **성능 고려사항**

#### Nullable 컬럼과 인덱스
```typescript
// ⚠️ 주의: nullable 컬럼의 unique constraint는 성능 영향
@Unique(['expenseId', 'memberId']) // memberId가 nullable
@Index(['memberId']) // nullable 컬럼 인덱스

// 💡 해결책: partial index 고려
// CREATE INDEX CONCURRENTLY idx_name ON table (col1, col2) WHERE col2 IS NOT NULL;
```

#### ID 타입 선택
```typescript
// ✅ 성능 우선: bigint (8바이트)
@PrimaryGeneratedColumn('increment', { type: 'bigint' })
id!: string; // Node.js bigint는 string으로 반환

// ⚠️ 기능 우선: uuid (16바이트)
@PrimaryGeneratedColumn('uuid')
id!: string;
```

### 3. **관계 정의 일관성**

```typescript
// ✅ 올바른 패턴: nullable 컬럼에 맞는 관계
@Column({ type: 'uuid', name: 'user_id', nullable: true })
userId!: string | null;

@ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
@JoinColumn({ name: 'user_id' })
user!: User | null;

// ❌ 잘못된 패턴: nullable 컬럼에 CASCADE
@ManyToOne(() => User, { onDelete: 'CASCADE' }) // nullable 컬럼인데 CASCADE
```

### 4. **타입 안전성**

```typescript
// ✅ 올바른 타입: 순환 참조 방지하면서 타입 안전성 확보
@ManyToOne('User', { nullable: true, onDelete: 'SET NULL' })
user!: import('../../user/entities/user.entity').User | null;

// ❌ 잘못된 타입: any 사용
@ManyToOne('User')
user!: any;
```

## 🚨 발견된 주요 이슈들

### 1. TravelExpenseParticipant
- **문제**: `memberId` (nullable)와 `userId` 중복으로 혼란
- **영향**: N+1 쿼리, 데이터 일관성 이슈
- **해결**: 역할 명확화 필요

### 2. 인덱스 성능
- **문제**: nullable 컬럼에 대한 unique constraint
- **영향**: NULL 값 처리 오버헤드
- **해결**: partial index 고려

### 3. 메모리 사용량
- **문제**: `displayName`, `splitAmount` 등 새 컬럼으로 SELECT 크기 증가
- **영향**: 네트워크 및 메모리 오버헤드
- **해결**: DTO로 필요한 필드만 조회

## 📊 성능 모니터링 권장사항

1. **쿼리 성능**: `EXPLAIN ANALYZE`로 새 인덱스 효과 측정
2. **메모리 사용량**: 캐시 크기 및 TTL 모니터링
3. **동시성**: 트랜잭션 락 시간 측정
4. **N+1 방지**: `@Relation` eager loading vs lazy loading 최적화

## 🔄 마이그레이션 가이드라인

1. **인덱스 추가**: `CREATE INDEX CONCURRENTLY` 사용
2. **컬럼 변경**: 백업 후 단계적 적용
3. **타입 변경**: 기존 데이터 호환성 확인
4. **관계 수정**: 제약조건 일관성 검증

---
*최종 업데이트: 2026-03-12*
*Railway DB 스키마 정합성 프로젝트 기준*