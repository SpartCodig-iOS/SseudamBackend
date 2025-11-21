import { ApiProperty } from '@nestjs/swagger';

class ProfileDataDto {
  @ApiProperty({ example: '60be2b70-65cf-4a90-a188-c8f967e1cbe7' })
  id!: string;

  @ApiProperty({ example: 'test@example.com' })
  email!: string;

  @ApiProperty({ example: '테스트 사용자', nullable: true })
  name!: string | null;

  @ApiProperty({ example: null, nullable: true })
  avatarURL!: string | null;

  @ApiProperty({ example: '2025-11-07T20:43:21.842Z', nullable: true })
  createdAt!: string | null;

  @ApiProperty({ example: '2025-11-07T20:43:21.842Z', nullable: true })
  updatedAt!: string | null;

  @ApiProperty({ example: 'user' })
  role!: string;

  @ApiProperty({ example: 'user' })
  userId!: string;

  @ApiProperty({ example: 'email' })
  loginType!: string;
}

export class ProfileResponseDto {
  @ApiProperty({ example: 200 })
  code!: number;

  @ApiProperty({ example: 'OK' })
  message!: string;

  @ApiProperty({ type: ProfileDataDto })
  data!: ProfileDataDto;
}
