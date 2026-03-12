/**
 * DisplayName 필드를 가진 엔티티를 위한 공통 인터페이스
 * TravelExpense, TravelExpenseParticipant, TravelMember 등에서 사용
 */
export interface IHasDisplayName {
  displayName: string | null;
}

/**
 * displayName 컬럼을 위한 공통 데코레이터 팩터리
 */
export function DisplayNameColumn() {
  const { Column } = require('typeorm');
  return Column({ type: 'text', nullable: true, name: 'display_name' });
}