import { Injectable, Logger } from '@nestjs/common';
import { UserService } from '../services/user.service';

export interface GetUserProfileInput {
  userId: number;
}

export interface GetUserProfileOutput {
  id: number;
  email: string;
  nickname?: string;
  profileImageUrl?: string;
  role: string;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class GetUserProfileUseCase {
  private readonly logger = new Logger(GetUserProfileUseCase.name);

  constructor(
    private readonly userService: UserService,
  ) {}

  async execute(input: GetUserProfileInput): Promise<GetUserProfileOutput> {
    try {
      this.logger.log('Executing get user profile use case');

      // 비즈니스 로직: 사용자 프로필 조회
      const user = await this.userService.findById(String(input.userId));

      return {
        id: Number(user.id), // string에서 number로 변환
        email: user.email,
        nickname: user.username, // nickname 대신 username 사용
        profileImageUrl: user.avatar_url || undefined, // profileImageUrl 대신 avatar_url 사용
        role: user.role,
        createdAt: user.created_at, // createdAt 대신 created_at 사용
        updatedAt: user.updated_at, // updatedAt 대신 updated_at 사용
      };
    } catch (error) {
      this.logger.error('Get user profile use case failed', error);
      throw error;
    }
  }
}