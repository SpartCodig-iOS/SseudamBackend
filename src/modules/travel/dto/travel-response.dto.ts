import { ApiProperty } from '@nestjs/swagger';

export class TravelSummaryDto {
  @ApiProperty({ example: 'c7d0c7f4-5e47-4f57-8a4f-7f2d08ed1234' })
  id!: string;

  @ApiProperty({ example: '도쿄 가을 여행' })
  title!: string;

  @ApiProperty({ example: '2025-10-01' })
  startDate!: string;

  @ApiProperty({ example: '2025-10-05' })
  endDate!: string;

  @ApiProperty({ example: 'JP' })
  countryCode!: string;

  @ApiProperty({ example: '일본', nullable: true, required: false })
  countryNameKr?: string;

  @ApiProperty({ example: ['JPY'], description: '여행 국가에서 사용하는 통화 리스트 (ISO 4217 코드)' })
  countryCurrencies!: string[];

  @ApiProperty({ example: 'JPY' })
  baseCurrency!: string;

  @ApiProperty({ example: 'JPY', description: '여행지 통화 코드(국가 코드 기반)' })
  destinationCurrency!: string;

  @ApiProperty({ example: 0.0091 })
  baseExchangeRate!: number;

  @ApiProperty({ example: 'ab12cd34', nullable: true, required: false })
  inviteCode?: string;

  @ApiProperty({ example: 'https://sseudam.up.railway.app/deeplink?inviteCode=ab12cd34', nullable: true, required: false })
  deepLink?: string;

  @ApiProperty({ example: 'active' })
  status!: string;

  @ApiProperty({ example: '2025-09-01T12:34:56.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '홍길동', nullable: true })
  ownerName!: string | null;

  @ApiProperty({ type: () => TravelMemberDto, isArray: true, required: false })
  members?: TravelMemberDto[];
}

export class TravelListResponseDto {
  @ApiProperty({ example: 42 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ type: () => TravelSummaryDto, isArray: true })
  items!: TravelSummaryDto[];
}

export class TravelMemberDto {
  @ApiProperty({ example: '8c4c3b33-...' })
  userId!: string;

  @ApiProperty({ example: '김철수', nullable: true })
  name!: string | null;

  @ApiProperty({ example: 'user@example.com', nullable: true })
  email?: string | null;

  @ApiProperty({ example: 'https://example.com/avatar.png', nullable: true })
  avatarUrl?: string | null;

  @ApiProperty({ example: 'member' })
  role!: string;
}

export class TravelExpenseParticipantDto {
  @ApiProperty({ example: '8c4c3b33-...' })
  memberId!: string;

  @ApiProperty({ example: '김철수', nullable: true })
  name!: string | null;
}

export class TravelExpenseMemberDto {
  @ApiProperty({ example: '8c4c3b33-...' })
  userId!: string;

  @ApiProperty({ example: '김철수', nullable: true })
  name!: string | null;

  @ApiProperty({ example: 'user@example.com', nullable: true })
  email!: string | null;

  @ApiProperty({ example: 'https://example.com/avatar.png', nullable: true })
  avatarUrl!: string | null;
}

export class TravelExpenseDto {
  @ApiProperty({ example: 'd1a2e3f4-...' })
  id!: string;

  @ApiProperty({ example: '라멘 식사' })
  title!: string;

  @ApiProperty({ example: '신주쿠역 인근' })
  note?: string | null;

  @ApiProperty({ example: 3500 })
  amount!: number;

  @ApiProperty({ example: 'JPY' })
  currency!: string;

  @ApiProperty({ example: 35200 })
  convertedAmount!: number;

  @ApiProperty({ example: '2025-11-17' })
  expenseDate!: string;

  @ApiProperty({
    example: 'food_and_drink',
    nullable: true,
    enum: ['accommodation', 'food_and_drink', 'transportation', 'activity', 'shopping', 'other'],
    description: '지출 카테고리',
  })
  category?: string | null;

  @ApiProperty({ example: 'e11cc73b-052d-4740-8213-999c05bfc332' })
  authorId!: string;

  @ApiProperty({ example: 'owner', required: false, description: '결제자 ID (생성/수정 응답에서는 포함될 수 있음)' })
  payerId?: string;

  @ApiProperty({ example: '홍길동', nullable: true })
  payerName!: string | null;

  @ApiProperty({
    type: () => TravelExpenseMemberDto,
    nullable: true,
    required: false,
    description: '결제자 상세 정보 (목록 응답에서 주로 반환)',
  })
  payer?: TravelExpenseMemberDto | null;

  @ApiProperty({ type: () => TravelExpenseParticipantDto, isArray: true })
  participants!: TravelExpenseParticipantDto[];

  @ApiProperty({
    type: () => TravelExpenseMemberDto,
    isArray: true,
    required: false,
    description: '해당 여행의 전체 멤버 (목록 응답에서 주로 반환)',
  })
  expenseMembers?: TravelExpenseMemberDto[];
}

export class TravelInviteResponseDto {
  @ApiProperty({ example: 'a1b2c3d4' })
  inviteCode!: string;

  @ApiProperty({ example: 'https://sseudam.up.railway.app/deeplink?inviteCode=a1b2c3d4' })
  deepLink!: string;
}
