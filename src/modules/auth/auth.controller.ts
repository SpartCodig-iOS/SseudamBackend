import { BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus, Post, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
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
import { success } from '../../types/api';
import { loginSchema, refreshSchema, signupSchema, logoutSchema } from '../../validators/authSchemas';
import { AuthGuard } from '../../common/guards/auth.guard';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { RequestWithUser } from '../../types/request';
import {
  DeleteAccountResponseDto,
  LoginResponseDto,
  RefreshResponseDto,
  SignupResponseDto,
} from './dto/auth-response.dto';
import { buildAuthSessionResponse } from './auth-response.util';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { LoginType } from '../../types/auth';
import { DeviceTokenService } from '../../services/device-token.service';

@ApiTags('Auth')
@Controller('api/v1/auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly optimizedDeleteService: OptimizedDeleteService,
    private readonly deviceTokenService: DeviceTokenService,
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
  @ApiOperation({ summary: '로그아웃 (sessionId 기반)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['sessionId'],
      properties: {
        sessionId: { type: 'string', description: '로그인 응답에서 받은 sessionId' },
      },
    },
  })
  async logout(@Body() body: unknown) {
    const payload = logoutSchema.parse(body);
    const result = await this.authService.logoutBySessionId(payload.sessionId);
    return success(result, 'Logout successful');
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
  async registerDeviceToken(
    @Body('deviceToken') deviceTokenRaw: unknown,
    @Body('pendingKey') pendingKeyRaw: unknown,
    @Req() req: RequestWithUser,
  ) {
    const deviceToken = typeof deviceTokenRaw === 'string' ? deviceTokenRaw.trim() : '';
    if (!deviceToken) {
      throw new BadRequestException('deviceToken is required');
    }
    const pendingKey = typeof pendingKeyRaw === 'string' ? pendingKeyRaw.trim() : undefined;

    if (req.currentUser?.id) {
      // 인증된 경우: 바로 사용자에 매핑
      await this.deviceTokenService.upsertDeviceToken(req.currentUser.id, deviceToken);
    } else {
      // 비인증: pendingKey가 있어야 매핑 가능
      if (!pendingKey) {
        throw new BadRequestException('pendingKey is required for anonymous registration');
      }
      await this.deviceTokenService.upsertAnonymousToken(pendingKey, deviceToken);
    }

    return success({}, 'Device token registered');
  }

}
