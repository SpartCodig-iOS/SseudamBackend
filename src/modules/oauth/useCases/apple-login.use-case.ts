import { Injectable, Logger } from '@nestjs/common';
import { SocialAuthService } from '../services/social-auth.service';
import { LoginType } from '../../auth/types/auth.types';

export interface AppleLoginInput {
  token: string;
  provider: 'apple';
}

export interface AppleLoginOutput {
  user: any;
  tokenPair: any;
  session: any;
  loginType: any;
  registered?: boolean;
}

@Injectable()
export class AppleLoginUseCase {
  private readonly logger = new Logger(AppleLoginUseCase.name);

  constructor(
    private readonly socialAuthService: SocialAuthService,
  ) {}

  async execute(input: AppleLoginInput): Promise<AppleLoginOutput> {
    try {
      this.logger.log('Executing Apple login use case');

      // 비즈니스 로직: Apple 로그인 처리
      const result = await this.socialAuthService.loginWithOAuthToken(input.token, LoginType.APPLE);

      return {
        user: result.user || null,
        tokenPair: result.tokenPair || null,
        session: result.session || null,
        loginType: LoginType.APPLE,
        registered: result.registered,
      };
    } catch (error) {
      this.logger.error('Apple login use case failed', error);
      throw error;
    }
  }
}