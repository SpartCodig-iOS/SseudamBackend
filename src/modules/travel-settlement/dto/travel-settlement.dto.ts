import { ApiProperty } from '@nestjs/swagger';

class SettlementEntryDto {
  @ApiProperty({ example: 'computed-0' })
  id!: string;

  @ApiProperty({ example: '홍길동' })
  fromMember!: string;

  @ApiProperty({ example: '김철수' })
  toMember!: string;

  @ApiProperty({ example: 35000 })
  amount!: number;

  @ApiProperty({ example: 'pending', enum: ['pending', 'completed'] })
  status!: 'pending' | 'completed';

  @ApiProperty({ example: '2025-11-14T12:00:00.000Z' })
  updatedAt!: string;
}

class BalanceEntryDto {
  @ApiProperty({ example: 'member-id' })
  memberId!: string;

  @ApiProperty({ example: '홍길동', nullable: true })
  name!: string | null;

  @ApiProperty({ example: 12000 })
  balance!: number;
}

export class TravelSettlementDto {
  @ApiProperty({ type: () => BalanceEntryDto, isArray: true })
  balances!: BalanceEntryDto[];

  @ApiProperty({ type: () => SettlementEntryDto, isArray: true })
  savedSettlements!: SettlementEntryDto[];

  @ApiProperty({ type: () => SettlementEntryDto, isArray: true })
  recommendedSettlements!: SettlementEntryDto[];
}
