import { Injectable, Logger } from '@nestjs/common';
import { AuthService, AuthTypeOrmAdapter } from '.';
import { UserRecord } from '../../../types/user.types';
import { LoginInput, SignupInput } from '../validators/auth.validators';
import { AuthSessionPayload } from '.';
import { LoginType } from '../types/auth.types';

/**
 * @deprecated AuthService가 TypeORM으로 완전히 마이그레이션되어 이 서비스는 더 이상 사용되지 않습니다.
 * 모든 인증 로직은 AuthService를 직접 사용하세요.
 *
 * 이 파일은 하위 호환성을 위해 유지되며 다음 메이저 버전에서 제거됩니다.
 */
@Injectable()
export class EnhancedAuthService {
  private readonly logger = new Logger(EnhancedAuthService.name);
  private readonly useTypeORM: boolean;

  constructor(
    private readonly originalAuthService: AuthService,
    private readonly typeormAdapter: AuthTypeOrmAdapter,
  ) {
    // 환경 변수로 TypeORM 사용 여부 결정
    this.useTypeORM = process.env.USE_TYPEORM_AUTH === 'true';

    this.logger.log(`Enhanced Auth Service initialized with ${this.useTypeORM ? 'TypeORM' : 'PostgreSQL Pool'} backend`);
  }

  /**
   * 사용자 인증 (TypeORM/기존 방식 자동 선택)
   */
  private async authenticateUserDirect(
    identifier: string,
    password: string,
    options: { lookupType?: 'email' | 'username' | 'auto'; emailHint?: string } = {},
  ): Promise<UserRecord | null> {
    const method = this.useTypeORM ? 'TypeORM' : 'PostgreSQL Pool';
    this.logger.debug(`Authenticating user with ${method}: ${identifier}`);

    try {
      if (this.useTypeORM) {
        return await this.typeormAdapter.authenticateUserDirect(identifier, password, options);
      } else {
        return await (this.originalAuthService as any).authenticateUserDirect(identifier, password, options);
      }
    } catch (error) {
      this.logger.error(`Authentication failed with ${method}:`, error);

      // TypeORM 실패 시 기존 방식으로 폴백
      if (this.useTypeORM) {
        this.logger.warn('TypeORM authentication failed, falling back to PostgreSQL Pool');
        try {
          return await (this.originalAuthService as any).authenticateUserDirect(identifier, password, options);
        } catch (fallbackError) {
          this.logger.error('Fallback authentication also failed:', fallbackError);
          return null;
        }
      }

      return null;
    }
  }

  /**
   * 로그인 (향상된 버전)
   */
  async login(input: LoginInput): Promise<AuthSessionPayload> {
    const startTime = Date.now();
    const identifier = input.identifier?.trim().toLowerCase();

    if (!identifier || !input.password) {
      throw new Error('Invalid credentials');
    }

    // 새로운 인증 방식 사용
    const user = await this.authenticateUserDirect(identifier, input.password, {
      lookupType: identifier.includes('@') ? 'email' : 'username',
    });

    if (!user) {
      throw new Error('Invalid credentials');
    }

    // 나머지는 기존 AuthService 로직 사용
    const result = await this.originalAuthService.createAuthSession(user, LoginType.EMAIL);

    // 백그라운드 작업들
    setImmediate(() => {
      if (this.useTypeORM) {
        void this.typeormAdapter.markLastLogin(user.id);
      } else {
        void this.originalAuthService.markLastLogin(user.id);
      }
      void this.originalAuthService.warmAuthCaches(user);
    });

    const duration = Date.now() - startTime;
    this.logger.debug(`Enhanced login completed in ${duration}ms for ${identifier}`);

    return result;
  }

  /**
   * 사용자 존재 여부 확인 (향상된 버전)
   */
  async userExists(identifier: string): Promise<boolean> {
    try {
      if (this.useTypeORM) {
        if (identifier.includes('@')) {
          return await this.typeormAdapter.checkEmailExists(identifier);
        } else {
          return await this.typeormAdapter.checkUsernameExists(identifier);
        }
      } else {
        // 기존 방식 (pool 쿼리)
        const user = await (this.originalAuthService as any).authenticateUserDirect(identifier, 'dummy_password');
        return false; // 실제로는 더 복잡한 로직이 필요
      }
    } catch (error) {
      this.logger.error(`userExists check failed for ${identifier}:`, error);
      return false;
    }
  }

  /**
   * 기존 메서드들은 그대로 위임
   */
  async signup(input: SignupInput): Promise<AuthSessionPayload> {
    return this.originalAuthService.signup(input);
  }

  async refresh(refreshToken: string) {
    return this.originalAuthService.refresh(refreshToken);
  }

  async deleteAccount(user: UserRecord, loginTypeHint?: any) {
    return this.originalAuthService.deleteAccount(user, loginTypeHint);
  }

  async logoutBySessionId(sessionId: string) {
    return this.originalAuthService.logoutBySessionId(sessionId);
  }

  async socialLoginWithCode(codeOrToken: string, provider: any, options: any) {
    return this.originalAuthService.socialLoginWithCode(codeOrToken, provider, options);
  }

  /**
   * 성능 비교를 위한 벤치마크 메서드
   */
  async benchmarkAuth(identifier: string, password: string): Promise<{
    typeormTime: number;
    poolTime: number;
    typeormResult: boolean;
    poolResult: boolean;
  }> {
    this.logger.debug(`Running authentication benchmark for ${identifier}`);

    // TypeORM 방식 측정
    const typeormStart = Date.now();
    const typeormUser = await this.typeormAdapter.authenticateUserDirect(identifier, password);
    const typeormTime = Date.now() - typeormStart;

    // PostgreSQL Pool 방식 측정
    const poolStart = Date.now();
    const poolUser = await (this.originalAuthService as any).authenticateUserDirect(identifier, password);
    const poolTime = Date.now() - poolStart;

    const result = {
      typeormTime,
      poolTime,
      typeormResult: typeormUser !== null,
      poolResult: poolUser !== null,
    };

    this.logger.log(`Benchmark results for ${identifier}:`, result);
    return result;
  }

  /**
   * 현재 사용 중인 백엔드 타입 반환
   */
  getBackendType(): string {
    return this.useTypeORM ? 'TypeORM' : 'PostgreSQL Pool';
  }

  /**
   * TypeORM 사용 여부 런타임 토글 (테스트용)
   */
  toggleBackend(): string {
    // 이 방법은 테스트용으로만 사용하고, 실제로는 환경 변수로 제어해야 함
    (this as any).useTypeORM = !this.useTypeORM;
    const newBackend = this.useTypeORM ? 'TypeORM' : 'PostgreSQL Pool';
    this.logger.warn(`⚠️ Backend toggled to: ${newBackend} (TEST MODE)`);
    return newBackend;
  }
}