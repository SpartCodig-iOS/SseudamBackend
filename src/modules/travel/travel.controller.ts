import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Req, UseGuards, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { success } from '../../types/api';
import { AuthGuard } from '../../common/guards/auth.guard';
import { RequestWithUser } from '../../types/request';
import { TravelService } from './travel.service';
import { createTravelSchema, travelInviteCodeSchema } from '../../validators/travelSchemas';
import { TravelInviteResponseDto, TravelSummaryDto } from './dto/travel-response.dto';

@ApiTags('Travels')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('api/v1/travels')
export class TravelController {
  constructor(private readonly travelService: TravelService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '참여 중인 여행 목록 조회' })
  @ApiOkResponse({ type: TravelSummaryDto, isArray: true })
  async list(@Req() req: RequestWithUser) {
    if (!req.currentUser) {
      throw new UnauthorizedException('Unauthorized');
    }
    const travels = await this.travelService.listTravels(req.currentUser.id);
    return success(travels);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '새 여행 생성' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['title', 'startDate', 'endDate', 'countryCode', 'baseCurrency', 'baseExchangeRate'],
      properties: {
        title: { type: 'string', example: '도쿄 가을 여행', description: '여행 이름' },
        startDate: {
          type: 'string',
          example: '2025-10-01',
          description: '여행 시작일 (YYYY-MM-DD)',
        },
        endDate: {
          type: 'string',
          example: '2025-10-05',
          description: '여행 종료일 (YYYY-MM-DD) - 시작일 이후여야 함',
        },
        countryCode: {
          type: 'string',
          example: 'JP',
          description: '여행 국가 ISO 3166-1 alpha-2 코드',
        },
        baseCurrency: {
          type: 'string',
          example: 'KRW',
          description: '기준 통화 (ISO 4217 코드, 예: KRW, USD, JPY)',
        },
        baseExchangeRate: {
          type: 'number',
          example: 105.6,
          description: '기준 통화 1,000단위 대비 상대 통화 금액 (예: 1000 KRW → 105.6 JPY)',
        },
      },
    },
  })
  @ApiOkResponse({ type: TravelSummaryDto })
  async create(@Body() body: unknown, @Req() req: RequestWithUser) {
    if (!req.currentUser) {
      throw new UnauthorizedException('Unauthorized');
    }
    const payload = createTravelSchema.parse(body);
    const travel = await this.travelService.createTravel(req.currentUser.id, payload);
    return success(travel, 'Travel created');
  }

  @Post(':travelId/invite')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '여행 초대 코드 생성' })
  @ApiOkResponse({ type: TravelInviteResponseDto })
  async createInvite(@Param('travelId') travelId: string, @Req() req: RequestWithUser) {
    if (!req.currentUser) {
      throw new UnauthorizedException('Unauthorized');
    }
    const invite = await this.travelService.createInvite(travelId, req.currentUser.id);
    return success(invite, 'Invite code issued');
  }

  @Post('join')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '초대 코드로 여행 참여' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['inviteCode'],
      properties: {
        inviteCode: { type: 'string', example: 'a1b2c3d4' },
      },
    },
  })
  @ApiOkResponse({ type: TravelSummaryDto })
  async join(@Body() body: unknown, @Req() req: RequestWithUser) {
    if (!req.currentUser) {
      throw new UnauthorizedException('Unauthorized');
    }
    const payload = travelInviteCodeSchema.parse(body);
    const travel = await this.travelService.joinByInviteCode(req.currentUser.id, payload.inviteCode);
    return success(travel, 'Joined travel');
  }

  @Delete(':travelId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '여행 삭제 (호스트 전용)' })
  async deleteTravel(@Param('travelId') travelId: string, @Req() req: RequestWithUser) {
    if (!req.currentUser) {
      throw new UnauthorizedException('Unauthorized');
    }
    await this.travelService.deleteTravel(travelId, req.currentUser.id);
    return success({}, 'Travel deleted');
  }
}
