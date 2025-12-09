import { BadRequestException, Controller, Get, HttpCode, HttpStatus, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { success } from '../../types/api';
import { VersionService } from './version.service';
import { AppVersionDto } from './dto/app-version.dto';

@ApiTags('Version')
@Controller('api/v1/version')
export class VersionController {
  constructor(private readonly versionService: VersionService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '앱 버전 조회 (고정된 bundleId: io.sseudam.co 사용)' })
  @ApiOkResponse({ type: AppVersionDto })
  @ApiQuery({
    name: 'currentVersion',
    required: false,
    schema: { type: 'string' },
    description: '현재 앱 버전 (예: 1.0.0)',
  })
  @ApiQuery({
    name: 'forceUpdate',
    required: false,
    schema: { type: 'boolean' },
    description: '강제 업데이트 플래그를 강제로 지정 (없으면 서버/최소버전 규칙 사용)',
  })
  async getAppVersion(
    @Query('currentVersion') currentVersion?: string,
    @Query('forceUpdate') forceUpdateRaw?: string,
  ) {
    let forceOverride: boolean | undefined;
    if (typeof forceUpdateRaw !== 'undefined') {
      const normalized = String(forceUpdateRaw).toLowerCase();
      if (['true', '1'].includes(normalized)) {
        forceOverride = true;
      } else if (['false', '0'].includes(normalized)) {
        forceOverride = false;
      } else {
        throw new BadRequestException("forceUpdate는 true/false 또는 1/0 값만 허용됩니다.");
      }
    }

    // bundleId는 하드코딩된 값 사용
    const version = await this.versionService.getAppVersion('io.sseudam.co', currentVersion, forceOverride);
    return success(version);
  }
}
