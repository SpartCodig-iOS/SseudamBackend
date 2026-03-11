import { BadRequestException, Controller, Get, HttpCode, HttpStatus, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { success } from '../../common/types/api.types';
import { SessionService } from '../auth/services/session.service';
import { SessionResponseDto } from './dto/session-response.dto';

@ApiTags('Session')
@Controller('api/v1/session')
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '세션 ID로 최근 로그인 정보를 조회 (초고속 최적화)' })
  @ApiQuery({ name: 'sessionId', required: true })
  @ApiOkResponse({ type: SessionResponseDto })
  async getSession(@Query('sessionId') sessionId?: string) {
    if (!sessionId) {
      throw new BadRequestException('sessionId is required');
    }
    const session = await this.sessionService.getSession(sessionId);
    if (!session) {
      throw new BadRequestException('Session not found or expired');
    }

    // 🚀 ULTRA-FAST: 활성 세션의 touch는 백그라운드로 처리해 응답 지연 제거
    if (session.isActive) {
      void this.sessionService.touchSession(sessionId);
    }

    const message = session.isActive ? 'Session info retrieved successfully' : 'Session info retrieved (inactive)';
    return success(session, message);
  }
}
