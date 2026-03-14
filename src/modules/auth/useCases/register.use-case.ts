import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { SignupInput } from '../validators/auth.validators';
import { AuthService } from '../services/auth.service';
import { LoginType } from '../types/auth.types';

export interface RegisterUseCaseInput extends SignupInput {}

export interface RegisterUseCaseOutput {
  user: any;
  tokenPair: any;
  session: any;
  loginType: LoginType;
  registered: boolean;
}

@Injectable()
export class RegisterUseCase {
  private readonly logger = new Logger(RegisterUseCase.name);

  constructor(
    private readonly authService: AuthService,
  ) {}

  async execute(input: RegisterUseCaseInput): Promise<RegisterUseCaseOutput> {
    try {
      this.logger.log('Executing register use case');

      // 비즈니스 로직: 회원가입 처리
      const result = await this.authService.signup(input);

      return {
        user: result.user,
        tokenPair: result.tokenPair,
        session: result.session,
        loginType: result.loginType,
        registered: true,
      };
    } catch (error) {
      this.logger.error('Register use case failed', error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Registration failed');
    }
  }
}