/**
 * 모든 엔티티의 공통 기본 클래스
 * 공통 생성자 패턴과 유틸리티 메서드 제공
 */
export abstract class BaseEntity {
  constructor(partial: Partial<any> = {}) {
    Object.assign(this, partial);
  }

  /**
   * 엔티티를 JSON으로 변환 (순환 참조 방지)
   */
  toJSON(): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(this)) {
      if (value !== undefined && !key.startsWith('_')) {
        result[key] = value;
      }
    }
    return result;
  }
}

/**
 * 타임스탬프 필드를 가진 엔티티를 위한 기본 클래스
 */
export abstract class TimestampedEntity extends BaseEntity {
  createdAt!: Date;
  updatedAt?: Date;
}