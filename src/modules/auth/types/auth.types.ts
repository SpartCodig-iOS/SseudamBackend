import { UserResponseDto } from '../../user/types/user.types';

export const LOGIN_TYPE_VALUES = ['email', 'username', 'signup', 'apple', 'google', 'kakao'] as const;
export type LoginType = (typeof LOGIN_TYPE_VALUES)[number];

export interface AuthResponseDto {
  user: UserResponseDto;
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresAt: string;
  refreshExpiresAt: string;
}
