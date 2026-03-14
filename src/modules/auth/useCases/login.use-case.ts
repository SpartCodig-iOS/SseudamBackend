import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { LoginInput } from '../validators/auth.validators';
import { AuthService } from '../services/auth.service';
import { LoginType } from '../types/auth.types';

export interface LoginUseCaseInput extends LoginInput {
  loginType?: LoginType;
}

export interface LoginUseCaseOutput {
  user: any;
  tokenPair: any;
  session: any;
  loginType: LoginType;
  registered?: boolean;
}

@Injectable()
export class LoginUseCase {
  private readonly logger = new Logger(LoginUseCase.name);

  constructor(
    private readonly authService: AuthService,
  ) {}

  async execute(input: LoginUseCaseInput): Promise<LoginUseCaseOutput> {
    try {
      this.logger.log('Executing login use case');

      // 비즈니스 로직: 로그인 처리
      const result = await this.authService.login(input);

      return {
        user: result.user,
        tokenPair: result.tokenPair,
        session: result.session,
        loginType: result.loginType,
        registered: result.registered,
      };
    } catch (error) {
      this.logger.error('Login use case failed', error);
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Login failed');
    }
  }
}