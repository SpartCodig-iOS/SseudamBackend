import { ApiProperty } from '@nestjs/swagger';

export class AuthUserDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id!: string;

  @ApiProperty({ example: 'user@example.com' })
  email!: string;

  @ApiProperty({ example: '홍길동', nullable: true })
  name!: string | null;

  @ApiProperty({ example: null, nullable: true })
  avatarURL!: string | null;

  @ApiProperty({ example: '2025-11-07T20:43:21.842Z', nullable: true })
  createdAt!: string | null;

  @ApiProperty({ example: 'user' })
  userId!: string;
}

export class AuthSessionEnvelopeDto {
  @ApiProperty({ type: AuthUserDto })
  user!: AuthUserDto;

  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  accessToken!: string;

  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  refreshToken!: string;

  @ApiProperty({ example: '2025-11-10T05:39:56.500Z' })
  accessTokenExpiresAt!: string;

  @ApiProperty({ example: '2025-11-16T05:39:56.500Z' })
  refreshTokenExpiresAt!: string;

  @ApiProperty({ example: '16d3f6c6-8b5d-4927-b1b7-0c08d08d874f' })
  sessionId!: string;

  @ApiProperty({ example: '2025-12-16T05:39:56.500Z' })
  sessionExpiresAt!: string;

  @ApiProperty({ example: '2025-11-14T11:52:04.000Z' })
  lastLoginAt!: string;

  @ApiProperty({ example: 'email' })
  loginType!: string;
}

export class SignupResponseDto {
  @ApiProperty({ example: 200 })
  code!: number;

  @ApiProperty({ example: 'Signup successful' })
  message!: string;

  @ApiProperty({ type: AuthSessionEnvelopeDto })
  data!: AuthSessionEnvelopeDto;
}

export class LoginResponseDto {
  @ApiProperty({ example: 200 })
  code!: number;

  @ApiProperty({ example: 'Login successful' })
  message!: string;

  @ApiProperty({ type: AuthSessionEnvelopeDto })
  data!: AuthSessionEnvelopeDto;
}

export class RefreshResponseDataDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  accessToken!: string;

  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  refreshToken!: string;

  @ApiProperty({ example: '2025-11-10T05:39:56.500Z' })
  accessTokenExpiresAt!: string;

  @ApiProperty({ example: '2025-11-16T05:39:56.500Z' })
  refreshTokenExpiresAt!: string;

  @ApiProperty({ example: '16d3f6c6-8b5d-4927-b1b7-0c08d08d874f' })
  sessionId!: string;

  @ApiProperty({ example: '2025-12-16T05:39:56.500Z' })
  sessionExpiresAt!: string;

  @ApiProperty({ example: 'email' })
  loginType!: string;
}

export class RefreshResponseDto {
  @ApiProperty({ example: 200 })
  code!: number;

  @ApiProperty({ example: 'Token refreshed successfully' })
  message!: string;

  @ApiProperty({ type: RefreshResponseDataDto })
  data!: RefreshResponseDataDto;
}

export class DeleteAccountResponseDataDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  userID!: string;

  @ApiProperty({ example: true })
  supabaseDeleted!: boolean;
}

export class DeleteAccountResponseDto {
  @ApiProperty({ example: 200 })
  code!: number;

  @ApiProperty({ example: 'Account deleted successfully' })
  message!: string;

  @ApiProperty({ type: DeleteAccountResponseDataDto })
  data!: DeleteAccountResponseDataDto;
}
