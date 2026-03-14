import { Injectable, Logger } from '@nestjs/common';
import { UserService } from '../services/user.service';

export interface UpdateUserProfileInput {
  userId: number;
  nickname?: string;
  profileImageUrl?: string;
}

export interface UpdateUserProfileOutput {
  success: boolean;
  message: string;
  user: {
    id: number;
    email: string;
    nickname?: string;
    profileImageUrl?: string;
    role: string;
    updatedAt: Date;
  };
}

@Injectable()
export class UpdateUserProfileUseCase {
  private readonly logger = new Logger(UpdateUserProfileUseCase.name);

  constructor(
    private readonly userService: UserService,
  ) {}

  async execute(input: UpdateUserProfileInput): Promise<UpdateUserProfileOutput> {
    try {
      this.logger.log('Executing update user profile use case');

      // 비즈니스 로직: 사용자 프로필 수정
      const updatedUser = await this.userService.updateProfile(String(input.userId), {
        username: input.nickname, // nickname 대신 username 사용
        avatar_url: input.profileImageUrl, // profileImageUrl 대신 avatar_url 사용
      });

      return {
        success: true,
        message: 'User profile updated successfully',
        user: {
          id: Number(updatedUser.id), // string에서 number로 변환
          email: updatedUser.email,
          nickname: updatedUser.username, // nickname 대신 username 사용
          profileImageUrl: updatedUser.avatar_url || undefined, // profileImageUrl 대신 avatar_url 사용
          role: updatedUser.role,
          updatedAt: updatedUser.updated_at, // updatedAt 대신 updated_at 사용
        },
      };
    } catch (error) {
      this.logger.error('Update user profile use case failed', error);
      throw error;
    }
  }
}