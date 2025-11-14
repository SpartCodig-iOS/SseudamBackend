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

  @ApiProperty({ example: 'JPY' })
  baseCurrency!: string;

  @ApiProperty({ example: 0.0091 })
  baseExchangeRate!: number;

  @ApiProperty({ example: 'ab12cd34', nullable: true, required: false })
  inviteCode?: string;

  @ApiProperty({ example: 'active' })
  status!: string;

  @ApiProperty({ example: 'owner' })
  role!: string;

  @ApiProperty({ example: '2025-09-01T12:34:56.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '홍길동', nullable: true })
  ownerName!: string | null;

  @ApiProperty({ type: () => TravelMemberDto, isArray: true })
  members!: TravelMemberDto[];
}

export class TravelMemberDto {
  @ApiProperty({ example: '8c4c3b33-...' })
  userId!: string;

  @ApiProperty({ example: '김철수', nullable: true })
  name!: string | null;

  @ApiProperty({ example: 'member' })
  role!: string;
}

export class TravelInviteResponseDto {
  @ApiProperty({ example: 'a1b2c3d4' })
  inviteCode!: string;
}
