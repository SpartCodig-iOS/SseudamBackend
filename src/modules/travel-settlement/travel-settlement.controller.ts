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

  @Get('statistics')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '정산 통계 조회 - 총 내역, 내가 쓴 금액, 모든 멤버의 받을/줄 금액' })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        code: { type: 'number', example: 200 },
        message: { type: 'string', example: 'success' },
        data: {
          type: 'object',
          properties: {
            totalExpenseAmount: { type: 'number', description: '총 지출 금액 (KRW)', example: 150000 },
            myPaidAmount: { type: 'number', description: '내가 지출한 금액 (KRW)', example: 80000 },
            mySharedAmount: { type: 'number', description: '내가 부담해야 할 금액 (KRW)', example: 75000 },
            myBalance: { type: 'number', description: '내 잔액 (양수: 받을 금액, 음수: 줄 금액)', example: 5000 },
            balanceStatus: { type: 'string', enum: ['receive', 'pay', 'settled'], description: '잔액 상태', example: 'receive' },
            memberBalances: {
              type: 'array',
              description: '모든 여행 멤버의 잔액 정보',
              items: {
                type: 'object',
                properties: {
                  memberId: { type: 'string', description: '멤버 ID', example: 'e11c473b-052d-4740-8213-999c05bfc332' },
                  memberName: { type: 'string', description: '멤버 이름', example: '홍길동' },
                  balance: { type: 'number', description: '잔액 (양수: 받을 금액, 음수: 줄 금액)', example: -5000 },
                  balanceStatus: { type: 'string', enum: ['receive', 'pay', 'settled'], description: '잔액 상태', example: 'pay' }
                }
              }
            }
          }
        }
      }
    }
  })
  async getStatistics(@Param('travelId') travelId: string, @Req() req: RequestWithUser) {
    if (!req.currentUser) {
      throw new UnauthorizedException('Unauthorized');
    }
    const statistics = await this.travelSettlementService.getSettlementStatistics(travelId, req.currentUser.id);
    return success(statistics);
  }

}
