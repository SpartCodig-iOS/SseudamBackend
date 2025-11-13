import { ApiProperty } from '@nestjs/swagger';

class HealthDataDto {
  @ApiProperty({ example: 'ok' })
  status!: string;

  @ApiProperty({ example: 'ok', enum: ['ok', 'unavailable', 'not_configured'] })
  database!: 'ok' | 'unavailable' | 'not_configured';
}

export class HealthResponseDto {
  @ApiProperty({ example: 200 })
  code!: number;

  @ApiProperty({ example: 'Success' })
  message!: string;

  @ApiProperty({ type: HealthDataDto })
  data!: HealthDataDto;
}
