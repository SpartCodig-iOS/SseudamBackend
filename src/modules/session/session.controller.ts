import { BadRequestException, Controller, Get, HttpCode, HttpStatus, Query, UnauthorizedException } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { success } from '../../types/api';
import { SessionService } from '../../services/sessionService';
import { SessionResponseDto } from './dto/session-response.dto';

@ApiTags('Session')
@Controller('api/v1/session')
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
@ApiQuery({
  name: 'sessionId',
  required: true,
  description: '초대/로그인 응답으로 받은 세션 ID',
})
  @ApiOperation({ summary: '세션 ID 로 현재 로그인 세션 정보 조회' })
  @ApiOkResponse({ type: SessionResponseDto })
  getSession(@Query('sessionId') sessionId?: string) {
    if (!sessionId) {
      throw new BadRequestException('Session ID parameter is required');
    }

    const session = this.sessionService.updateSessionLastLogin(sessionId);
    if (!session) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    return success(
      {
        loginType: session.loginType || 'unknown',
        lastLoginAt: session.lastLoginAt || null,
        userId: session.userId,
        email: session.email,
        sessionId: session.sessionId,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
      },
      'Session info retrieved successfully',
    );
  }
}
