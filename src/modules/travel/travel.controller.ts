import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  ParseUUIDPipe,
  Req,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { success } from '../../types/api';
import { AuthGuard } from '../../common/guards/auth.guard';
import { RequestWithUser } from '../../types/request';
import { TravelService } from './travel.service';
import { createTravelSchema, travelInviteCodeSchema, transferOwnershipSchema } from '../../validators/travelSchemas';
import { TravelInviteResponseDto, TravelListResponseDto, TravelSummaryDto } from './dto/travel-response.dto';

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
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['active', 'archived'],
    description: '여행 상태에 따라 목록을 필터링합니다.',
  })
  @ApiOkResponse({ type: TravelListResponseDto })
  async list(@Req() req: RequestWithUser, @Req() request: RequestWithUser) {
    if (!req.currentUser) {
      throw new UnauthorizedException('Unauthorized');
    }
    const page = Number((request.query?.page as string) ?? '1') || 1;
    const limit = Number((request.query?.limit as string) ?? '20') || 20;
    const requestedStatus = (request.query?.status as string | undefined)?.toLowerCase();
    let status: 'active' | 'archived' | undefined;
    if (requestedStatus) {
      if (requestedStatus !== 'active' && requestedStatus !== 'archived') {
        throw new BadRequestException("status는 'active' 혹은 'archived' 값만 허용됩니다.");
      }
      status = requestedStatus as 'active' | 'archived';
    }
    const result = await this.travelService.listTravels(req.currentUser.id, { page, limit, status });
    return success(result);
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
        countryNameKr: {
          type: 'string',
          example: '일본',
          description: '여행 국가 한국어 이름 (선택사항)',
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
    const currentUser = req.currentUser;
    if (!currentUser) {
      throw new Error('Authenticated user not found in request');
    }
    const travel = await this.travelService.createTravel(currentUser, payload);
    return success(travel, 'Travel created');
  }

  @Patch(':travelId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '여행 정보 수정 (호스트 전용)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['title', 'startDate', 'endDate', 'countryCode', 'baseCurrency', 'baseExchangeRate'],
      properties: {
        title: { type: 'string', example: '일본 겨울 여행' },
        startDate: { type: 'string', example: '2025-12-01' },
        endDate: { type: 'string', example: '2025-12-05' },
        countryCode: { type: 'string', example: 'JP' },
        countryNameKr: {
          type: 'string',
          example: '일본',
          description: '여행 국가 한국어 이름 (선택사항)',
        },
        baseCurrency: { type: 'string', example: 'KRW' },
        baseExchangeRate: { type: 'number', example: 105.6 },
      },
    },
  })
  @ApiOkResponse({ type: TravelSummaryDto })
  async updateTravel(
    @Param('travelId', new ParseUUIDPipe({ version: '4' })) travelId: string,
    @Body() body: unknown,
    @Req() req: RequestWithUser,
  ) {
    if (!req.currentUser) {
      throw new UnauthorizedException('Unauthorized');
    }
    const payload = createTravelSchema.parse(body);
    const travel = await this.travelService.updateTravel(travelId, req.currentUser.id, payload);
    return success(travel, 'Travel updated');
  }

  @Get(':travelId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '여행 상세 조회 (travelId 기반)' })
  @ApiOkResponse({ type: TravelSummaryDto })
  async getTravel(
    @Param('travelId', new ParseUUIDPipe({ version: '4' })) travelId: string,
    @Req() req: RequestWithUser,
  ) {
    if (!req.currentUser) {
      throw new UnauthorizedException('Unauthorized');
    }
    const travel = await this.travelService.getTravelDetail(travelId, req.currentUser.id);
    return success(travel);
  }

  @Delete(':travelId/members/:memberId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '여행 멤버 삭제 (호스트 전용)' })
  async removeMember(
    @Param('travelId', new ParseUUIDPipe({ version: '4' })) travelId: string,
    @Param('memberId', new ParseUUIDPipe({ version: '4' })) memberId: string,
    @Req() req: RequestWithUser,
  ) {
    if (!req.currentUser) {
      throw new UnauthorizedException('Unauthorized');
    }
    await this.travelService.removeMember(travelId, req.currentUser.id, memberId);
    return success({}, 'Member removed');
  }

  @Post(':travelId/invite')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '여행 초대 코드 생성' })
  @ApiOkResponse({ type: TravelInviteResponseDto })
  async createInvite(
    @Param('travelId', new ParseUUIDPipe({ version: '4' })) travelId: string,
    @Req() req: RequestWithUser,
  ) {
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

  @Get('join/:inviteCode')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '딥링크로 여행 참여 (GET 방식)' })
  @UseGuards(AuthGuard)
  async joinByDeepLink(
    @Param('inviteCode') inviteCode: string,
    @Req() req: RequestWithUser,
  ) {
    if (!req.currentUser) {
      throw new UnauthorizedException('Unauthorized');
    }

    try {
      const travel = await this.travelService.joinByInviteCode(req.currentUser.id, inviteCode);

      return success({
        ...travel,
        joinMethod: 'deeplink'
      }, 'Successfully joined travel via deep link');

    } catch (error) {
      if (error instanceof BadRequestException) {
        throw new BadRequestException('이미 참여중인 여행이거나 유효하지 않은 초대 코드입니다.');
      }
      throw error;
    }
  }

  @Patch(':travelId/owner')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '여행 호스트 권한 위임 (기존 호스트 → 멤버)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['newOwnerId'],
      properties: {
        newOwnerId: { type: 'string', format: 'uuid', example: 'e11cc73b-052d-4740-8213-999c05bfc332' },
      },
    },
  })
  @ApiOkResponse({ type: TravelSummaryDto })
  async transferOwnership(
    @Param('travelId', new ParseUUIDPipe({ version: '4' })) travelId: string,
    @Body() body: unknown,
    @Req() req: RequestWithUser,
  ) {
    if (!req.currentUser) {
      throw new UnauthorizedException('Unauthorized');
    }
    const payload = transferOwnershipSchema.parse(body);
    const travel = await this.travelService.transferOwnership(travelId, req.currentUser.id, payload.newOwnerId);
    return success(travel, 'Travel ownership transferred');
  }

  @Delete(':travelId/leave')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '여행 나가기 (멤버만 가능, 호스트 불가)' })
  async leaveTravel(
    @Param('travelId', new ParseUUIDPipe({ version: '4' })) travelId: string,
    @Req() req: RequestWithUser,
  ) {
    if (!req.currentUser) {
      throw new UnauthorizedException('Unauthorized');
    }
    const result = await this.travelService.leaveTravel(travelId, req.currentUser.id);
    return success(result, result.deletedTravel ? 'Travel deleted' : 'Left travel');
  }

  @Delete(':travelId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '여행 삭제 (호스트 전용)' })
  async deleteTravel(
    @Param('travelId', new ParseUUIDPipe({ version: '4' })) travelId: string,
    @Req() req: RequestWithUser,
  ) {
    if (!req.currentUser) {
      throw new UnauthorizedException('Unauthorized');
    }
    await this.travelService.deleteTravel(travelId, req.currentUser.id);
    return success({}, 'Travel deleted');
  }
}
