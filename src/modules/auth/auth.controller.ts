import { BadRequestException, Body, Controller, Delete, HttpCode, HttpStatus, Logger, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { OptimizedDeleteService } from './optimized-delete.service';
import { success } from '../../common/types/api.types';
import { loginSchema, refreshSchema, signupSchema, logoutSchema } from './schemas/auth.schemas';
import { AuthGuard } from '../../common/guards/auth.guard';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { RequestWithUser } from '../../common/types/request.types';
import {
  DeleteAccountResponseDto,
  LoginResponseDto,
  RefreshResponseDto,
  SignupResponseDto,
} from './dto/auth-response.dto';
import { buildAuthSessionResponse } from './auth-response.util';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { LoginType } from './types/auth.types';
import { DeviceTokenService } from '../oauth/services/device-token.service';
import { AnalyticsService } from '../../common/services/analytics.service';
import { JwtTokenService } from './services/jwt.service';
import { SessionService } from './services/session.service';
import { EnhancedJwtService } from './services/enhanced-jwt.service';
import { JwtBlacklistService } from './services/jwt-blacklist.service';

@ApiTags('Auth')
@Controller('api/v1/auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly optimizedDeleteService: OptimizedDeleteService,
    private readonly deviceTokenService: DeviceTokenService,
    private readonly analyticsService: AnalyticsService,
    private readonly jwtTokenService: JwtTokenService,
    private readonly sessionService: SessionService,
    private readonly enhancedJwtService: EnhancedJwtService,
    private readonly jwtBlacklistService: JwtBlacklistService,
  ) {}

  @Post('signup')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 5, windowMs: 15 * 60 * 1000, keyPrefix: 'auth:signup' })
  @ApiOperation({ summary: '사용자 회원가입' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email', 'password'],
      properties: {
        email: { type: 'string', format: 'email', example: 'string' },
        password: { type: 'string', minLength: 6, example: 'string' },
        name: { type: 'string', example: 'string' },
        deviceToken: { type: 'string', description: 'APNS device token for push notifications', nullable: true },
        pendingKey: { type: 'string', description: 'anonymous token matching key', nullable: true },
      },
    },
  })
  @ApiOkResponse({ type: SignupResponseDto })
  @ApiBadRequestResponse({
    description: '잘못된 요청 본문',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'integer', example: 400 },
        message: { type: 'string', example: 'email and password are required' },
      },
    },
  })
  async signup(@Body() body: unknown) {
    const payload = signupSchema.parse(body);
    const result = await this.authService.signup(payload);

    // deviceToken이 제공되면 디바이스 토큰 저장
    if (result.user?.id) {
      await this.deviceTokenService.bindPendingTokensToUser(
        result.user.id,
        (payload as any).pendingKey,
        payload.deviceToken,
      ).catch(err => console.warn('Failed to bind device token:', err.message));
    }

    // Analytics: 회원가입 성공
    if (result.user?.id) {
      this.analyticsService.trackEvent(
        'signup_success',
        { provider: (payload as any).provider ?? 'email' },
        { userId: result.user.id },
      ).catch(() => undefined);
    }

    return success(buildAuthSessionResponse(result), 'Signup successful');
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 5, windowMs: 15 * 60 * 1000, keyPrefix: 'auth:login' })
  @ApiOperation({ summary: '로그인 (이메일/아이디 또는 소셜 accessToken/code)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        identifier: {
          type: 'string',
          description: '이메일 전체 또는 아이디',
          example: 'user 또는 user@example.com',
        },
        provider: {
          type: 'string',
          enum: ['email', 'google', 'apple', 'kakao'],
          description: '소셜 로그인 시 provider 지정',
        },
        accessToken: {
          type: 'string',
          description: '소셜 accessToken (카카오는 authorizationCode+codeVerifier 권장)',
        },
        authorizationCode: {
          type: 'string',
          description: '소셜 authorizationCode (카카오 필수, 애플/구글은 refresh 교환용)',
        },
        codeVerifier: {
          type: 'string',
          description: 'PKCE code_verifier (카카오 인가코드 교환 시 전달)',
        },
        redirectUri: {
          type: 'string',
          description: '카카오 인가 요청에 사용한 redirectUri (기본값과 다를 때 전달)',
        },
        email: {
          type: 'string',
          format: 'email',
          description: '(선택) identifier 대신 사용할 이메일',
          example: 'user@example.com',
        },
        password: { type: 'string', example: 'string' },
        deviceToken: { type: 'string', description: 'APNS device token for push notifications', nullable: true },
        pendingKey: { type: 'string', description: 'anonymous token matching key', nullable: true },
      },
    },
  })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiBadRequestResponse({
    description: '이메일/패스워드 누락',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'integer', example: 400 },
        message: { type: 'string', example: 'email and password are required' },
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: '자격 증명 오류',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'integer', example: 401 },
        message: { type: 'string', example: 'Invalid credentials' },
      },
    },
  })
  async login(@Body() body: unknown) {
    const payload = loginSchema.parse(body) as any;

    // 소셜 로그인 분기: provider=kakao/apple/google && accessToken/authorizationCode 제공
    if (payload.provider && payload.provider !== 'email' && (payload.accessToken || payload.authorizationCode)) {
      if (payload.provider !== 'kakao' && !payload.accessToken) {
        throw new UnauthorizedException('accessToken is required for social login');
      }
      if (payload.provider === 'kakao') {
        if (!payload.authorizationCode) {
          throw new UnauthorizedException('authorizationCode is required for Kakao login');
        }
        if (!payload.codeVerifier) {
          throw new UnauthorizedException('codeVerifier is required for Kakao PKCE login');
        }
      }

      const token = (payload.accessToken ?? payload.authorizationCode) as string;
      const result = await this.authService.socialLoginWithCode(token, payload.provider as LoginType, {
        authorizationCode: payload.authorizationCode,
        codeVerifier: payload.codeVerifier,
        redirectUri: payload.redirectUri,
      });

      // deviceToken이 제공되면 디바이스 토큰 저장
      if (payload.deviceToken && result.user?.id) {
        await this.deviceTokenService.upsertDeviceToken(result.user?.id, payload.deviceToken).catch(err => {
          console.warn('Failed to save device token:', err.message);
        });
      }

      if (result.user?.id) {
        this.analyticsService.trackEvent(
          'login_success',
          { provider: (payload as any).provider ?? 'email' },
          { userId: result.user.id },
        ).catch(() => undefined);
      }
      return success(buildAuthSessionResponse(result), 'Login successful');
    }

    const result = await this.authService.login(payload);

    // deviceToken이 제공되면 디바이스 토큰 저장
    if (result.user?.id) {
      await this.deviceTokenService.bindPendingTokensToUser(
        result.user.id,
        (payload as any).pendingKey,
        payload.deviceToken,
      ).catch(err => {
        console.warn('Failed to bind device token:', err.message);
      });
    }

    // Analytics: 로그인 성공
    if (result.user?.id) {
      this.analyticsService.trackEvent(
        'login_success',
        { provider: (payload as any).provider ?? 'email' },
        { userId: result.user.id },
      ).catch(() => undefined);
    }

    return success(buildAuthSessionResponse(result), 'Login successful');
  }


  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh 토큰으로 Access 토큰 재발급' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['refreshToken'],
      properties: {
        refreshToken: {
          type: 'string',
          example: 'string',
        },
      },
    },
  })
  @ApiOkResponse({ type: RefreshResponseDto })
  @ApiBadRequestResponse({
    description: 'Refresh 토큰 누락',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'integer', example: 400 },
        message: { type: 'string', example: 'refreshToken is required' },
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Refresh 토큰 검증 실패',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'integer', example: 401 },
        message: { type: 'string', example: 'Invalid or expired refresh token' },
      },
    },
  })
  async refresh(@Body() body: unknown) {
    const payload = refreshSchema.parse(body);
    this.logger.debug(`🔄 Token refresh attempt - refreshToken: ${payload.refreshToken?.substring(0, 20)}...`);
    const result = await this.authService.refresh(payload.refreshToken);

    return success(
      {
        accessToken: result.tokenPair.accessToken,
        refreshToken: result.tokenPair.refreshToken,
        accessTokenExpiresAt: result.tokenPair.accessTokenExpiresAt.toISOString(),
        refreshTokenExpiresAt: result.tokenPair.refreshTokenExpiresAt.toISOString(),
        sessionId: result.session.sessionId,
        sessionExpiresAt: result.session.expiresAt,
        loginType: result.loginType,
      },
      'Token refreshed successfully',
    );
  }


  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '본인 계정 삭제 (Supabase 계정 포함)' })
  @ApiOkResponse({ type: DeleteAccountResponseDto })
  @ApiUnauthorizedResponse({
    description: '인증 실패',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'integer', example: 401 },
        message: { type: 'string', example: 'Unauthorized' },
      },
    },
  })
  @Delete('account')
  @HttpCode(HttpStatus.OK)
  async deleteAccount(@Req() req: RequestWithUser) {
    const currentUser = req.currentUser;
    if (!currentUser) {
      throw new UnauthorizedException('Unauthorized');
    }

    // 최적화된 삭제 서비스 사용
    const result = await this.optimizedDeleteService.fastDeleteAccount(currentUser, req.loginType);
    return success(
      {
        userID: currentUser.id,
        supabaseDeleted: result.supabaseDeleted,
      },
      'Account deleted successfully',
    );
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '로그아웃 (sessionId + JWT blacklist 통합)',
    description:
      'sessionId로 세션을 삭제하고, Authorization 헤더의 Bearer 토큰이 있으면 ' +
      'JWT blacklist에도 등록하여 즉시 무효화합니다. ' +
      '두 작업을 하나의 요청으로 처리하므로 /logout-jwt 를 별도로 호출할 필요가 없습니다.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['sessionId'],
      properties: {
        sessionId: { type: 'string', description: '로그인 응답에서 받은 sessionId' },
      },
    },
  })
  async logout(@Body() body: unknown, @Req() req: RequestWithUser) {
    const payload = logoutSchema.parse(body);

    // Authorization 헤더에서 Bearer 토큰 추출 (있는 경우 blacklist 처리)
    const authHeader = req.headers?.authorization ?? '';
    const accessToken = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : undefined;

    const result = await this.authService.logout({
      sessionId: payload.sessionId,
      accessToken,
    });

    return success(result, 'Logout successful');
  }

  @Post('logout-jwt')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'JWT 토큰 기반 로그아웃 (Enhanced Blacklist)',
    description: 'JWT 토큰을 blacklist에 추가하여 즉시 무효화합니다.'
  })
  @ApiOkResponse({
    description: '로그아웃 성공',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'number', example: 200 },
        message: { type: 'string', example: 'JWT token invalidated successfully' },
        data: {
          type: 'object',
          properties: {
            invalidated: { type: 'boolean', example: true },
            tokenId: { type: 'string', example: 'uuid-token-id' },
          },
        },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: '인증되지 않은 요청' })
  async logoutJwt(@Req() req: RequestWithUser) {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new UnauthorizedException('Bearer token is required');
      }

      const token = authHeader.substring(7); // Remove 'Bearer '

      // JWT 토큰을 blacklist에 추가
      const invalidated = await this.enhancedJwtService.invalidateToken(token, 'logout');

      if (!invalidated) {
        throw new BadRequestException('Failed to invalidate token');
      }

      // 토큰에서 정보 추출 (디코딩만, 검증 X)
      const decodedToken = this.enhancedJwtService.decodeToken(token);
      const tokenId = decodedToken?.tokenId || 'unknown';

      this.logger.log(`JWT token invalidated via logout: ${tokenId} - User: ${req.currentUser?.id}`);

      return success(
        {
          invalidated: true,
          tokenId,
          message: 'Token has been added to blacklist and is no longer valid'
        },
        'JWT token invalidated successfully'
      );
    } catch (error) {
      this.logger.error(`JWT logout error: ${error instanceof Error ? error.message : String(error)}`, error instanceof Error ? error.stack : undefined);
      if (error instanceof UnauthorizedException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Failed to process JWT logout');
    }
  }

  @Post('refresh-jwt')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 20, windowMs: 60 * 1000, keyPrefix: 'auth:refresh-jwt' })
  @ApiOperation({
    summary: 'JWT 토큰 새로고침 (Enhanced Blacklist)',
    description: 'Refresh token을 사용하여 새로운 Access/Refresh 토큰 쌍을 발급합니다. 기존 토큰들은 blacklist에 추가됩니다.'
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['refreshToken'],
      properties: {
        refreshToken: { type: 'string', description: 'Refresh Token' },
      },
    },
  })
  @ApiOkResponse({
    description: '토큰 새로고침 성공',
    type: RefreshResponseDto,
  })
  @ApiBadRequestResponse({ description: '잘못된 요청' })
  @ApiUnauthorizedResponse({ description: '유효하지 않은 refresh token' })
  async refreshJwt(@Body() body: { refreshToken: string }) {
    try {
      const { refreshToken } = body;

      if (!refreshToken) {
        throw new BadRequestException('Refresh token is required');
      }

      // Enhanced JWT 서비스로 토큰 새로고침
      const newTokenPair = await this.enhancedJwtService.refreshTokens(refreshToken);

      if (!newTokenPair) {
        throw new UnauthorizedException('Invalid or expired refresh token');
      }

      this.logger.log(`JWT tokens refreshed: ${newTokenPair.tokenId}`);

      return success(
        {
          accessToken: newTokenPair.accessToken,
          refreshToken: newTokenPair.refreshToken,
          accessTokenTTL: newTokenPair.accessTokenTTL,
          refreshTokenTTL: newTokenPair.refreshTokenTTL,
          tokenId: newTokenPair.tokenId,
        },
        'Tokens refreshed successfully'
      );
    } catch (error) {
      this.logger.error(`JWT refresh error: ${error instanceof Error ? error.message : String(error)}`, error instanceof Error ? error.stack : undefined);
      if (error instanceof UnauthorizedException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Failed to refresh tokens');
    }
  }

  @Post('invalidate-all-tokens')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '사용자의 모든 JWT 토큰 무효화',
    description: '보안 사고나 계정 탈퇴 시 사용자의 모든 토큰을 blacklist에 추가하여 무효화합니다.'
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          enum: ['logout', 'security', 'admin'],
          default: 'security',
          description: '무효화 사유'
        },
      },
    },
  })
  @ApiOkResponse({
    description: '모든 토큰 무효화 성공',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'number', example: 200 },
        message: { type: 'string', example: 'All user tokens invalidated successfully' },
        data: {
          type: 'object',
          properties: {
            invalidatedCount: { type: 'number', example: 5 },
            userId: { type: 'string', example: 'uuid-user-id' },
            reason: { type: 'string', example: 'security' },
          },
        },
      },
    },
  })
  async invalidateAllUserTokens(
    @Req() req: RequestWithUser,
    @Body() body: { reason?: 'logout' | 'security' | 'admin' }
  ) {
    try {
      const { reason = 'security' } = body;
      const userId = req.currentUser!.id;

      // 사용자의 모든 토큰 무효화
      const invalidatedCount = await this.enhancedJwtService.invalidateAllUserTokens(userId, reason);

      this.logger.warn(`All tokens invalidated for user ${userId} - Count: ${invalidatedCount} - Reason: ${reason}`);

      return success(
        {
          invalidatedCount,
          userId,
          reason,
          message: `${invalidatedCount} tokens have been invalidated`
        },
        'All user tokens invalidated successfully'
      );
    } catch (error) {
      this.logger.error(`Invalidate all tokens error: ${error instanceof Error ? error.message : String(error)}`, error instanceof Error ? error.stack : undefined);
      throw new BadRequestException('Failed to invalidate tokens');
    }
  }

  @Post('device-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '디바이스 토큰 등록/업데이트 (인증/비인증 모두 가능)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['deviceToken'],
      properties: {
        deviceToken: {
          type: 'string',
          example: 'fe13ccdb7ea3fe314f0df403383b7d5d974dd0f946cd4b89b0f1fd7523dc9a07',
          description: 'APNS device token',
        },
        pendingKey: {
          type: 'string',
          example: 'anon-uuid-123',
          description: '로그인 전 토큰 매칭용 키(비로그인 등록 시 필수)',
          nullable: true,
        },
      },
    },
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        code: { type: 'number', example: 200 },
        message: { type: 'string', example: 'Device token registered' },
        data: {
          type: 'object',
          properties: {
            deviceToken: { type: 'string', example: 'fe13ccdb...' },
            pendingKey: { type: 'string', example: 'anon-uuid-123', nullable: true },
            mode: { type: 'string', example: 'anonymous', description: 'anonymous | authenticated' },
          },
        },
      },
    },
  })
  async registerDeviceToken(
    @Body('deviceToken') deviceTokenRaw: unknown,
    @Body('pendingKey') pendingKeyRaw: unknown,
    @Req() req: RequestWithUser,
  ) {
    const startTime = Date.now();
    const deviceToken = typeof deviceTokenRaw === 'string' ? deviceTokenRaw.trim() : '';
    if (!deviceToken) {
      throw new BadRequestException('deviceToken is required');
    }
    const pendingKey = typeof pendingKeyRaw === 'string' ? pendingKeyRaw.trim() : undefined;

    const resolvedUserId = req.currentUser?.id ?? (await this.resolveUserIdFromHeader(req));
    if (!resolvedUserId && !pendingKey) {
      throw new BadRequestException('pendingKey is required for anonymous registration');
    }
    const mode: 'authenticated' | 'anonymous' = resolvedUserId ? 'authenticated' : 'anonymous';

    // 메인 작업은 백그라운드로 돌리고 최대 200ms만 대기해서 빠른 응답
    const workPromise = (async () => {
      if (resolvedUserId) {
        if (pendingKey) {
          await this.deviceTokenService.bindPendingTokensToUser(resolvedUserId, pendingKey, deviceToken);
        }
        await this.deviceTokenService.upsertDeviceToken(resolvedUserId, deviceToken);
      } else {
        await this.deviceTokenService.upsertAnonymousToken(pendingKey as string, deviceToken);
      }
    })();

    const loggingPromise = workPromise
      .then(() => {
        this.logger.debug(
          `[device-token] mode=${mode} ${resolvedUserId ? `user=${resolvedUserId}` : `pendingKey=${pendingKey}`} tokenPrefix=${deviceToken.slice(0, 8)} elapsed=${Date.now() - startTime}ms`,
        );
      })
      .catch((error) => {
        this.logger.warn(
          `[device-token] background work failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      });

    const quickTimeout = new Promise((resolve) => setTimeout(resolve, 200));
    await Promise.race([loggingPromise, quickTimeout]);

    return success({ deviceToken, pendingKey, mode }, 'Device token registered');
  }

  /**
   * Authorization 헤더의 Bearer 토큰이 있으면 검증하여 userId를 반환
   */
  private async resolveUserIdFromHeader(req: RequestWithUser): Promise<string | null> {
    const authHeader = req.headers?.authorization ?? '';
    if (!authHeader.toLowerCase().startsWith('bearer ')) {
      return null;
    }
    const token = authHeader.slice(7).trim();
    if (!token) return null;

    try {
      const payload = this.jwtTokenService.verifyAccessToken(token);
      if (!payload?.sub || !payload.sessionId) return null;

      // 세션이 유효한지 확인 (만료/취소된 세션이면 무시)
      const session = await this.sessionService.getSession(payload.sessionId);
      if (!session?.isActive) return null;

      return payload.sub;
    } catch {
      return null;
    }
  }
}
