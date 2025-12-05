import { ApiProperty } from '@nestjs/swagger';

export class KakaoAuthResponseDto {
  @ApiProperty({ example: 'user-id-from-kakao' })
  userId!: string;

  @ApiProperty({ example: 'access-token' })
  accessToken!: string;

  @ApiProperty({ example: 'refresh-token' })
  refreshToken!: string;

  @ApiProperty({ example: 'Bearer' })
  tokenType!: string;

  @ApiProperty({ example: new Date().toISOString() })
  expiresAt!: string;

  @ApiProperty({ example: new Date().toISOString() })
  refreshExpiresAt!: string;
}
