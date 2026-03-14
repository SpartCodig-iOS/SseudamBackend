import { Injectable, Logger } from '@nestjs/common';
import { AuthService } from '../services/auth.service';

export interface LogoutUseCaseInput {
  sessionId: string;
  accessToken?: string;
}

export interface LogoutUseCaseOutput {
  success: boolean;
  message: string;
}

@Injectable()
export class LogoutUseCase {
  private readonly logger = new Logger(LogoutUseCase.name);

  constructor(
    private readonly authService: AuthService,
  ) {}

  async execute(input: LogoutUseCaseInput): Promise<LogoutUseCaseOutput> {
    try {
      this.logger.log('Executing logout use case');

      // 비즈니스 로직: 로그아웃 처리
      const result = await this.authService.logout({
        sessionId: input.sessionId,
        accessToken: input.accessToken,
      });

      return {
        success: true,
        message: 'Logged out successfully',
      };
    } catch (error) {
      this.logger.error('Logout use case failed', error);
      throw error;
    }
  }
}