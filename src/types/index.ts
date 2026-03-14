// 하위 호환성을 위한 전역 타입 re-export
// @deprecated 새로운 코드에서는 도메인별 타입을 직접 import하세요

// Shared types
export * from '../shared/domain/types';

// Domain-specific types
export * from '../modules/user/domain/types';
export * from '../modules/auth/domain/types';
export * from '../modules/notification/domain/types';
export * from '../modules/travel/domain/types';