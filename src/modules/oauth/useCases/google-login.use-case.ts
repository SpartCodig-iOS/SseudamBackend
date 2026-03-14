import { Injectable, Logger } from '@nestjs/common';
import { SocialAuthService } from '../services/social-auth.service';
import { LoginType } from '../../auth/types/auth.types';

export interface GoogleLoginInput {
  token: string;
  provider: 'google';
}

export interface GoogleLoginOutput {
  user: any;
  tokenPair: any;
  session: any;
  loginType: any;
  registered?: boolean;
}

@Injectable()
export class GoogleLoginUseCase {
  private readonly logger = new Logger(GoogleLoginUseCase.name);

  constructor(
    private readonly socialAuthService: SocialAuthService,
  ) {}

  async execute(input: GoogleLoginInput): Promise<GoogleLoginOutput> {
    try {
      this.logger.log('Executing Google login use case');

      // 비즈니스 로직: Google 로그인 처리
      const result = await this.socialAuthService.loginWithOAuthToken(input.token, LoginType.GOOGLE);

      return {
        user: result.user || null,
        tokenPair: result.tokenPair || null,
        session: result.session || null,
        loginType: LoginType.GOOGLE,
        registered: result.registered,
      };
    } catch (error) {
      this.logger.error('Google login use case failed', error);
      throw error;
    }
  }
}