import { ApiProperty } from '@nestjs/swagger';

export class ExchangeRateDto {
  @ApiProperty({ example: 'KRW' })
  baseCurrency!: string;

  @ApiProperty({ example: 'USD' })
  quoteCurrency!: string;

  @ApiProperty({ example: 0.00074 })
  rate!: number;

  @ApiProperty({ example: '2025-11-14' })
  date!: string;

  @ApiProperty({ example: 1000 })
  baseAmount!: number;

  @ApiProperty({ example: 0.74 })
  quoteAmount!: number;
}
