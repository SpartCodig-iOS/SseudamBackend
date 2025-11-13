import { Body, Controller, Delete, HttpCode, HttpStatus, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
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
import { success } from '../../types/api';
import { loginSchema, refreshSchema, signupSchema } from '../../validators/authSchemas';
import { toUserResponse } from '../../utils/mappers';
import { AuthGuard } from '../../common/guards/auth.guard';
import { RequestWithUser } from '../../types/request';
import {
  DeleteAccountResponseDto,
  LoginResponseDto,
  RefreshResponseDto,
  SignupResponseDto,
} from './dto/auth-response.dto';

@ApiTags('Auth')
@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '사용자 회원가입' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email', 'password'],
      properties: {
        email: { type: 'string', format: 'email', example: 'string' },
        password: { type: 'string', minLength: 6, example: 'string' },
        name: { type: 'string', example: 'string' },
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

    return success(
      {
        user: toUserResponse(result.user),
        accessToken: result.tokenPair.accessToken,
        refreshToken: result.tokenPair.refreshToken,
        accessTokenExpiresAt: result.tokenPair.accessTokenExpiresAt.toISOString(),
        refreshTokenExpiresAt: result.tokenPair.refreshTokenExpiresAt.toISOString(),
        sessionId: result.session.sessionId,
        sessionExpiresAt: result.session.expiresAt,
      },
      'Signup successful',
    );
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '로그인 (이메일 또는 아이디)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['password'],
      properties: {
        identifier: {
          type: 'string',
          description: '이메일 전체 또는 @ 앞부분 아이디',
          example: 'string',
        },
        email: {
          type: 'string',
          format: 'email',
          description: 'identifier 대신 email 사용 가능',
          example: 'string',
        },
        password: { type: 'string', example: 'string' },
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
    const payload = loginSchema.parse(body);
    const result = await this.authService.login(payload);

    return success(
      {
        user: toUserResponse(result.user),
        accessToken: result.tokenPair.accessToken,
        refreshToken: result.tokenPair.refreshToken,
        accessTokenExpiresAt: result.tokenPair.accessTokenExpiresAt.toISOString(),
        refreshTokenExpiresAt: result.tokenPair.refreshTokenExpiresAt.toISOString(),
        sessionId: result.session.sessionId,
        sessionExpiresAt: result.session.expiresAt,
        lastLoginAt: result.session.lastLoginAt,
      },
      'Login successful',
    );
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

    const result = await this.authService.deleteAccount(currentUser);
    return success(
      {
        userID: currentUser.id,
        supabaseDeleted: result.supabaseDeleted,
      },
      'Account deleted successfully',
    );
  }
}
