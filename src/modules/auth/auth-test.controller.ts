import { Controller, Post, Body, Get, Query, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiExcludeController } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginInput } from '../../validators/authSchemas';

/**
 * 개발/스테이징 환경 전용 인증 테스트 컨트롤러.
 * 프로덕션에서는 인스턴스화 시 즉시 ForbiddenException을 던집니다.
 * AuthModule에서 주석 처리되어 있으며 필요 시에만 활성화합니다.
 */
@ApiTags('Auth Testing')
@ApiExcludeController()
@Controller('auth-test')
export class AuthTestController {
  constructor(
    private readonly authService: AuthService,
  ) {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('AuthTestController is not available in production');
    }
  }

  @Post('login')
  @ApiOperation({ summary: 'TypeORM 기반 로그인 테스트' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  async login(@Body() loginInput: LoginInput) {
    return this.authService.login(loginInput);
  }

  @Get('backend-status')
  @ApiOperation({ summary: '현재 백엔드 상태 확인' })
  @ApiResponse({ status: 200, description: 'Backend status' })
  getBackendStatus() {
    return {
      backend: 'TypeORM',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('user-exists')
  @ApiOperation({ summary: '사용자 존재 여부 확인 (이메일 기준)' })
  @ApiResponse({ status: 200, description: 'User existence check' })
  async checkUserExists(@Query('identifier') identifier: string | undefined) {
    if (!identifier) {
      return { error: 'identifier query parameter is required' };
    }
    const exists = await this.authService['userRepository'].findByEmail(identifier.toLowerCase()) !== null
      || await this.authService['userRepository'].findByUsername(identifier) !== null;
    return {
      identifier,
      exists,
      backend: 'TypeORM',
    };
  }
}
