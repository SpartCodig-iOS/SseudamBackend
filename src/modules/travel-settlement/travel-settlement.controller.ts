import { Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../common/guards/auth.guard';
import { success } from '../../types/api';
import { RequestWithUser } from '../../types/request';
import { TravelSettlementService } from './travel-settlement.service';
import { TravelSettlementDto } from './dto/travel-settlement.dto';

@ApiTags('Travel Settlements')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('api/v1/travels/:travelId/settlements')
export class TravelSettlementController {
  constructor(private readonly travelSettlementService: TravelSettlementService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '정산 요약 조회' })
  @ApiOkResponse({ type: TravelSettlementDto })
  async getSummary(@Param('travelId') travelId: string, @Req() req: RequestWithUser) {
    if (!req.currentUser) {
      throw new UnauthorizedException('Unauthorized');
    }
    const summary = await this.travelSettlementService.getSettlementSummary(travelId, req.currentUser.id);
    return success(summary);
  }

  @Post('save')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '정산 추천 결과 저장' })
  @ApiOkResponse({ type: TravelSettlementDto })
  async saveSettlements(@Param('travelId') travelId: string, @Req() req: RequestWithUser) {
    if (!req.currentUser) {
      throw new UnauthorizedException('Unauthorized');
    }
    const summary = await this.travelSettlementService.saveComputedSettlements(travelId, req.currentUser.id);
    return success(summary, 'Settlements saved');
  }

  @Patch(':settlementId/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '정산 완료 처리' })
  @Patch(':settlementId/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '정산 완료 처리' })
  @ApiOkResponse({ type: TravelSettlementDto })
  async completeSettlement(
    @Param('travelId') travelId: string,
    @Param('settlementId') settlementId: string,
    @Req() req: RequestWithUser,
  ) {
    if (!req.currentUser) {
      throw new UnauthorizedException('Unauthorized');
    }
    const summary = await this.travelSettlementService.markSettlementCompleted(
      travelId,
      req.currentUser.id,
      settlementId,
    );
    return success(summary, 'Settlement completed');
  }
}
