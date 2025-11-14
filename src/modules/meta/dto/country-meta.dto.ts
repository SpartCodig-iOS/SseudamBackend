import { ApiProperty } from '@nestjs/swagger';

export class CountryMetaDto {
  @ApiProperty({ example: 'KR' })
  code!: string;

  @ApiProperty({ example: '대한민국' })
  nameKo!: string;

  @ApiProperty({ example: 'South Korea' })
  nameEn!: string;

  @ApiProperty({ type: [String], example: ['KRW'] })
  currencies!: string[];
}
