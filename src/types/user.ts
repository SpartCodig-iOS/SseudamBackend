export interface UserRecord {
  id: string;
  email: string;
  password_hash: string;
  name: string | null;
  avatar_url: string | null;
  username: string;
  created_at: Date | null;
  updated_at: Date | null;
}

export interface UserResponseDto {
  id: string;
  email: string;
  name: string | null;
  avatarURL: string | null;
  createdAt: Date | null;
  userId: string;
}

export interface UserProfileDto {
  id: string;
  userId: string;
  email: string;
  name: string | null;
  avatarURL: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}
