import { ApiProperty } from '@nestjs/swagger';

class SessionDataDto {
  @ApiProperty({ example: 'email' })
  loginType!: string;

  @ApiProperty({ example: '2025-11-08T20:39:05.084Z', nullable: true })
  lastLoginAt!: string | null;

  @ApiProperty({ example: 'f22fc114-8dc4-4b0a-a77a-559e2abbad80' })
  userId!: string;

  @ApiProperty({ example: 'testuser@example.com' })
  email!: string;

  @ApiProperty({ example: 'c46760962b6433f148963bd6645d1b6e5c342a41178dbfc66cfb75aa8bb03c48' })
  sessionId!: string;

  @ApiProperty({ example: '2025-11-09T05:55:28.259Z' })
  createdAt!: string;

  @ApiProperty({ example: '2025-11-10T05:55:28.259Z' })
  expiresAt!: string;
}

export class SessionResponseDto {
  @ApiProperty({ example: 200 })
  code!: number;

  @ApiProperty({ example: 'Session info retrieved successfully' })
  message!: string;

  @ApiProperty({ type: SessionDataDto })
  data!: SessionDataDto;
}
