import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Health')
@Controller()
@Public()
export class SimpleHealthController {
  @Get('health')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '기본 서버 상태 확인' })
  health() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      message: 'Server is running with Legacy JWT support v2',
    };
  }

  @Get('ping')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '단순 Ping 테스트' })
  ping() {
    return {
      pong: true,
      timestamp: Date.now()
    };
  }
}