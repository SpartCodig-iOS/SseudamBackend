import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum } from 'class-validator';

export class OAuthLoginDto {
  @ApiProperty({ example: 'google-access-token' })
  @IsString()
  token!: string;

  @ApiProperty({ enum: ['google', 'apple', 'kakao'] })
  @IsEnum(['google', 'apple', 'kakao'])
  provider!: 'google' | 'apple' | 'kakao';

  @ApiProperty({ required: false, description: 'Login type for backward compatibility' })
  @IsOptional()
  @IsString()
  loginType?: string;

  @ApiProperty({ required: false, description: 'Authorization code for Apple/Kakao' })
  @IsOptional()
  @IsString()
  authorizationCode?: string;

  @ApiProperty({ required: false, description: 'Access token for Google/legacy' })
  @IsOptional()
  @IsString()
  accessToken?: string;

  @ApiProperty({ required: false, description: 'Apple refresh token' })
  @IsOptional()
  @IsString()
  appleRefreshToken?: string;

  @ApiProperty({ required: false, description: 'Google refresh token' })
  @IsOptional()
  @IsString()
  googleRefreshToken?: string;

  @ApiProperty({ required: false, description: 'Kakao refresh token' })
  @IsOptional()
  @IsString()
  kakaoRefreshToken?: string;

  @ApiProperty({ required: false, description: 'Code verifier for PKCE' })
  @IsOptional()
  @IsString()
  codeVerifier?: string;

  @ApiProperty({ required: false, description: 'Redirect URI' })
  @IsOptional()
  @IsString()
  redirectUri?: string;

  @ApiProperty({ required: false, description: 'Device token for push notifications' })
  @IsOptional()
  @IsString()
  deviceToken?: string;
}