import { UserRecord, UserResponseDto, UserProfileDto } from '../types/user';

export const toUserResponse = (user: UserRecord): UserResponseDto => ({
  id: user.id,
  email: user.email,
  name: user.name,
  avatarURL: user.avatar_url,
  createdAt: user.created_at,
  userId: user.username,
});

export const toProfileResponse = (user: UserRecord): UserProfileDto => ({
  id: user.id,
  userId: user.username,
  email: user.email,
  name: user.name,
  avatarURL: user.avatar_url,
  createdAt: user.created_at,
  updatedAt: user.updated_at,
});
