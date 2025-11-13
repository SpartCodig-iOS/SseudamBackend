import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { success } from '../../types/api';
import { SupabaseService } from '../../services/supabaseService';
import { HealthResponseDto } from './dto/health-response.dto';

@ApiTags('Health')
@Controller()
export class HealthController {
  constructor(private readonly supabaseService: SupabaseService) {}

  @Get('health')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '서버 및 데이터베이스 상태 확인' })
  @ApiOkResponse({ type: HealthResponseDto })
  async health() {
    const database = await this.supabaseService.checkProfilesHealth();

    return success({
      status: 'ok',
      database,
    });
  }
}
