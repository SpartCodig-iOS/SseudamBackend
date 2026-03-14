import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, Post, Query, UseGuards, Req, UnauthorizedException, Res } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SocialAuthService } from './social-auth.service';
import { OptimizedOAuthService } from './optimized-oauth.service';
import { appleRevokeSchema, oauthTokenSchema } from '../../validators/authSchemas';
import { success } from '../../types/api';
import { LoginResponseDto } from '../auth/dto/auth-response.dto';
import { SocialLookupResponseDto } from './dto/oauth-response.dto';
import { buildAuthSessionResponse, buildLightweightAuthResponse } from '../auth/auth-response.util';
import { AuthGuard } from '../../common/guards/auth.guard';
import { RequestWithUser } from '../../types/request';
import { CacheService } from '../cache-shared/services/cacheService';
import { DeviceTokenService } from '../notification/services/device-token.service';
import { randomBytes } from 'crypto';

@ApiTags('OAuth')
@Controller('api/v1/oauth')
export class OAuthController {
  constructor(
    private readonly socialAuthService: SocialAuthService,
    private readonly optimizedOAuthService: OptimizedOAuthService,
    private readonly cacheService: CacheService,
    private readonly deviceTokenService: DeviceTokenService,
  ) {}

  private async handleOAuthLogin(body: unknown, message: string) {
    const payload = oauthTokenSchema.parse(body);

    // Kakao는 authorizationCode + codeVerifier 필수, accessToken 경로는 사용하지 않음
    const tokenToUse = payload.loginType === 'kakao'
      ? payload.authorizationCode
      : payload.accessToken;
    if (!tokenToUse) {
      throw new BadRequestException('Missing token or authorizationCode');
    }

    // 최적화된 OAuth 서비스 사용
    const result = await this.optimizedOAuthService.fastOAuthLogin(
      tokenToUse,
      payload.loginType,
      {
        appleRefreshToken: payload.appleRefreshToken,
        googleRefreshToken: payload.googleRefreshToken,
        authorizationCode: payload.authorizationCode,
        codeVerifier: payload.codeVerifier,
        redirectUri: payload.redirectUri,
      },
    );

    // deviceToken이 제공되면 디바이스 토큰 저장
    if (payload.deviceToken && result.user?.id) {
      await this.deviceTokenService.upsertDeviceToken(result.user.id, payload.deviceToken).catch(err => {
        console.warn('Failed to save device token:', err.message);
      });
    }

    return success(buildLightweightAuthResponse(result), message);
  }

  @Post('signup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '소셜 OAuth 회원가입 (access token → 서버 JWT)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['accessToken'],
      properties: {
        accessToken: { type: 'string', description: 'Supabase access token (JWT)' },
        loginType: {
          type: 'string',
          description: '로그인 타입 (기본값 email)',
          example: 'apple',
          nullable: true,
        },
        authorizationCode: {
          type: 'string',
          description: '애플/구글 authorization_code (refresh token 교환용)',
          nullable: true,
        },
        codeVerifier: {
          type: 'string',
          description: 'PKCE code_verifier (카카오 인가 코드 교환 시 필요, Kakao 필수)',
          nullable: true,
        },
        redirectUri: {
          type: 'string',
          description: '인가 요청에 사용한 redirectUri (카카오 커스텀 스킴 등)',
          nullable: true,
        },
        deviceToken: {
          type: 'string',
          description: 'APNS device token for push notifications',
          nullable: true,
        },
      },
    },
  })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiBadRequestResponse({
    description: 'accessToken 누락',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'integer', example: 400 },
        message: { type: 'string', example: 'accessToken is required' },
      },
    },
  })
  async issueToken(@Body() body: unknown) {
    return this.handleOAuthLogin(body, 'Signup successful');
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '소셜/OAuth access token으로 로그인' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['accessToken'],
      properties: {
        accessToken: { type: 'string', description: 'Supabase access token (JWT)' },
        loginType: {
          type: 'string',
          description: '로그인 타입 (기본값 email)',
          example: 'apple',
          nullable: true,
        },
        deviceToken: {
          type: 'string',
          description: 'APNS device token for push notifications',
          nullable: true,
        },
      },
    },
  })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiBadRequestResponse({
    description: 'accessToken 누락',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'integer', example: 400 },
        message: { type: 'string', example: 'accessToken is required' },
      },
    },
  })
  async login(@Body() body: unknown) {
    return this.handleOAuthLogin(body, 'Login successful');
  }

  @Post('lookup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '소셜/OAuth access token으로 가입 여부 확인 (최적화)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['accessToken'],
      properties: {
        accessToken: { type: 'string', description: 'Supabase access token (JWT)' },
        loginType: {
          type: 'string',
          description: '로그인 타입 (기본값 email)',
          example: 'apple',
          nullable: true,
        },
      },
    },
  })
  @ApiOkResponse({ type: SocialLookupResponseDto })
  @ApiBadRequestResponse({
    description: 'accessToken 누락',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'integer', example: 400 },
        message: { type: 'string', example: 'accessToken is required' },
      },
    },
  })
  async lookupOAuthAccount(@Body() body: unknown) {
    const payload = oauthTokenSchema.parse(body);
    if (payload.loginType === 'kakao' && payload.authorizationCode) {
      if (!payload.codeVerifier) {
        throw new BadRequestException('codeVerifier is required for Kakao PKCE lookup');
      }
      const result = await this.socialAuthService.checkKakaoAccountWithCode(payload.authorizationCode, {
        codeVerifier: payload.codeVerifier,
        redirectUri: payload.redirectUri,
      });
      return success(result, 'Lookup successful');
    }

    const result = await this.socialAuthService.checkOAuthAccount(payload.accessToken, payload.loginType);
    return success(result, 'Lookup successful');
  }

  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @Post('apple/revoke')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '애플 OAuth 연결 해제' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['refreshToken'],
      properties: {
        refreshToken: { type: 'string', description: 'Apple refresh token (user-specific)' },
      },
    },
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        code: { type: 'integer', example: 200 },
        message: { type: 'string', example: 'Apple connection revoked' },
        data: { type: 'object', example: {} },
      },
    },
  })
  async revokeApple(@Body() body: unknown, @Req() req: RequestWithUser) {
    if (!req.currentUser) {
      throw new UnauthorizedException('Unauthorized');
    }
    const payload = appleRevokeSchema.parse(body);
    await this.socialAuthService.revokeAppleConnection(req.currentUser.id, payload.refreshToken);
    return success({}, 'Apple connection revoked');
  }

  @Get('kakao/callback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Kakao OAuth callback (code/state → token exchange)' })
  async kakaoCallback(
    @Query('code') code?: string,
    @Query('state') state?: string,
    @Query('redirect_uri') redirectUriQuery?: string,
    @Res() res?: any,
  ) {
    const deepLinkBase = 'sseudam://oauth/kakao';
    const redirect = (url: string) => {
      if (res) {
        res.status(HttpStatus.FOUND);
        res.setHeader('Location', url);
        res.setHeader('Content-Length', '0');
        res.end();
        return;
      }
      return {
        statusCode: HttpStatus.FOUND,
        headers: { Location: url, 'Content-Length': '0' },
        body: '',
      };
    };

    if (!code) {
      return redirect(`${deepLinkBase}?error=${encodeURIComponent('missing_code')}`);
    }

    let codeVerifier: string | undefined;
    let redirectUri: string | undefined = redirectUriQuery;
    if (state) {
      try {
        const decoded = Buffer.from(state.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
        const parsed = JSON.parse(decoded) as { codeVerifier?: string; code_verifier?: string; redirectUri?: string; redirect_uri?: string };
        codeVerifier = parsed.codeVerifier ?? parsed.code_verifier;
        redirectUri = parsed.redirectUri ?? parsed.redirect_uri ?? redirectUri;
      } catch {
        codeVerifier = state;
      }
    }

    try {
      const result = await this.optimizedOAuthService.fastOAuthLogin(code, 'kakao', {
        authorizationCode: code,
        codeVerifier,
        redirectUri,
      });

      // 1회용 티켓 생성 후 딥링크로 리다이렉트
      const ticket = randomBytes(32).toString('hex');
      const ticketTtl = 180; // 3분
      const authResponse = buildAuthSessionResponse(result);
      const payloadToStore = {
        ...authResponse,
        registered: (result as any).registered ?? false,
      };
      await this.cacheService.set(ticket, payloadToStore, { ttl: ticketTtl, prefix: 'kakao:ticket' });

      return redirect(`${deepLinkBase}?ticket=${ticket}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown_error';
      return redirect(`${deepLinkBase}?error=${encodeURIComponent(message)}`);
    }
  }

  @Post('kakao/finalize')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Kakao OAuth 티켓 → 최종 토큰 교환' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['ticket'],
      properties: {
        ticket: { type: 'string', description: '콜백에서 받은 1회용 티켓' },
      },
    },
  })
  async finalizeKakaoTicket(@Body('ticket') ticket?: string) {
    try {
      if (!ticket) {
        throw new BadRequestException('ticket is required');
      }

      // Redis가 지연되거나 장애 시 2초 내 빠르게 실패
      const payload = await Promise.race([
        this.cacheService.get<any>(ticket, { prefix: 'kakao:ticket' }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
      ]);
      await this.cacheService.del(ticket, { prefix: 'kakao:ticket' }).catch(() => undefined); // 재사용 방지
      if (!payload) {
        throw new BadRequestException('ticket is expired or invalid');
      }
      return success(payload, 'Login successful');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'finalize_failed';
      throw new BadRequestException(message);
    }
  }
}
