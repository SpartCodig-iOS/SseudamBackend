import { ApiProperty } from '@nestjs/swagger';

export class SessionResponseDto {
  @ApiProperty({ example: '16d3f6c6-...' })
  sessionId!: string;

  @ApiProperty({ example: '5815702d-...' })
  userId!: string;

  @ApiProperty({ example: 'email' })
  loginType!: string;

  @ApiProperty({ example: '2025-11-15T10:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2025-11-20T10:00:00.000Z' })
  lastSeenAt!: string;

  @ApiProperty({ example: '2025-12-15T10:00:00.000Z' })
  expiresAt!: string;
}
