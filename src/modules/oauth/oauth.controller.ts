import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards, Req, UnauthorizedException } from '@nestjs/common';
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
import { buildLightweightAuthResponse } from '../auth/auth-response.util';
import { AuthGuard } from '../../common/guards/auth.guard';
import { RequestWithUser } from '../../types/request';

@ApiTags('OAuth')
@Controller('api/v1/oauth')
export class OAuthController {
  constructor(
    private readonly socialAuthService: SocialAuthService,
    private readonly optimizedOAuthService: OptimizedOAuthService,
  ) {}

  private async handleOAuthLogin(body: unknown, message: string) {
    const payload = oauthTokenSchema.parse(body);

    // 최적화된 OAuth 서비스 사용
    const result = await this.optimizedOAuthService.fastOAuthLogin(
      payload.accessToken,
      payload.loginType,
      {
        appleRefreshToken: payload.appleRefreshToken,
        googleRefreshToken: payload.googleRefreshToken,
        authorizationCode: payload.authorizationCode,
        codeVerifier: payload.codeVerifier,
        redirectUri: payload.redirectUri,
      },
    );
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
    return this.handleOAuthLogin(body, 'Login successful');
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
}
