import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { RefreshTokenInput } from '../validators/auth.validators';
import { AuthService } from '../services/auth.service';

export interface RefreshTokenUseCaseInput extends RefreshTokenInput {}

export interface RefreshTokenUseCaseOutput {
  user: any;
  tokenPair: any;
  session: any;
  loginType: any;
}

@Injectable()
export class RefreshTokenUseCase {
  private readonly logger = new Logger(RefreshTokenUseCase.name);

  constructor(
    private readonly authService: AuthService,
  ) {}

  async execute(input: RefreshTokenUseCaseInput): Promise<RefreshTokenUseCaseOutput> {
    try {
      this.logger.log('Executing refresh token use case');

      // 비즈니스 로직: 토큰 갱신 처리
      const result = await this.authService.refresh(input.refreshToken);

      return {
        user: result.user,
        tokenPair: result.tokenPair,
        session: result.session,
        loginType: result.loginType,
      };
    } catch (error) {
      this.logger.error('Refresh token use case failed', error);
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Token refresh failed');
    }
  }
}