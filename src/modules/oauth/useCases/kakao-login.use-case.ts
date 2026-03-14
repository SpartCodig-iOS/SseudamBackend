import { Injectable, Logger } from '@nestjs/common';
import { SocialAuthService } from '../services/social-auth.service';
import { LoginType } from '../../auth/types/auth.types';

export interface KakaoLoginInput {
  token: string;
  provider: 'kakao';
}

export interface KakaoLoginOutput {
  user: any;
  tokenPair: any;
  session: any;
  loginType: any;
  registered?: boolean;
}

@Injectable()
export class KakaoLoginUseCase {
  private readonly logger = new Logger(KakaoLoginUseCase.name);

  constructor(
    private readonly socialAuthService: SocialAuthService,
  ) {}

  async execute(input: KakaoLoginInput): Promise<KakaoLoginOutput> {
    try {
      this.logger.log('Executing Kakao login use case');

      // 비즈니스 로직: Kakao 로그인 처리
      const result = await this.socialAuthService.loginWithOAuthToken(input.token, LoginType.KAKAO);

      return {
        user: result.user || null,
        tokenPair: result.tokenPair || null,
        session: result.session || null,
        loginType: LoginType.KAKAO,
        registered: result.registered,
      };
    } catch (error) {
      this.logger.error('Kakao login use case failed', error);
      throw error;
    }
  }
}