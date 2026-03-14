import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
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
  async getSummary(
    @Param('travelId') travelId: string,
    @Req() req: RequestWithUser,
  ) {
    if (!req.currentUser) {
      throw new UnauthorizedException('Unauthorized');
    }
    const summary = await this.travelSettlementService.getSettlementSummary(
      travelId,
      req.currentUser.id,
    );
    return success(summary);
  }

  @Post('compute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '정산 계산 결과 저장 (낙관적 락 + 멱등성 보장)',
    description:
      'Idempotency-Key 헤더를 제공하면 동일 키의 중복 요청을 막아 줍니다. ' +
      '두 사용자가 동시에 요청할 경우 두 번째 요청은 409 Conflict를 반환합니다.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    description: '클라이언트가 생성한 UUID — 동일 키로 재요청 시 캐시된 결과 반환',
    required: false,
  })
  @ApiOkResponse({ type: TravelSettlementDto })
  async saveComputed(
    @Param('travelId') travelId: string,
    @Req() req: RequestWithUser,
    @Headers('Idempotency-Key') idempotencyKey?: string,
  ) {
    if (!req.currentUser) {
      throw new UnauthorizedException('Unauthorized');
    }
    const summary = await this.travelSettlementService.saveComputedSettlements(
      travelId,
      req.currentUser.id,
      { idempotencyKey: idempotencyKey ?? undefined },
    );
    return success(summary);
  }

  @Patch(':settlementId/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '특정 정산 완료 처리 (낙관적 락 — 동시 수정 방지)',
    description:
      '이미 완료 상태인 항목은 재처리 없이 현재 정산 요약을 반환합니다 (멱등성). ' +
      '다른 사용자가 동시에 같은 항목을 수정하면 409 Conflict를 반환합니다.',
  })
  @ApiOkResponse({ type: TravelSettlementDto })
  async markComplete(
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
    return success(summary);
  }

  @Get('statistics')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '정산 통계 조회 - 총 내역, 내가 쓴 금액, 모든 멤버의 받을/줄 금액',
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        code: { type: 'number', example: 200 },
        message: { type: 'string', example: 'success' },
        data: {
          type: 'object',
          properties: {
            totalExpenseAmount: { type: 'number', example: 150000 },
            myPaidAmount: { type: 'number', example: 80000 },
            mySharedAmount: { type: 'number', example: 75000 },
            myBalance: { type: 'number', example: 5000 },
            balanceStatus: {
              type: 'string',
              enum: ['receive', 'pay', 'settled'],
              example: 'receive',
            },
            memberBalances: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  memberId: { type: 'string' },
                  memberName: { type: 'string' },
                  balance: { type: 'number' },
                  balanceStatus: {
                    type: 'string',
                    enum: ['receive', 'pay', 'settled'],
                  },
                },
              },
            },
          },
        },
      },
    },
  })
  async getStatistics(
    @Param('travelId') travelId: string,
    @Req() req: RequestWithUser,
  ) {
    if (!req.currentUser) {
      throw new UnauthorizedException('Unauthorized');
    }
    const statistics = await this.travelSettlementService.getSettlementStatistics(
      travelId,
      req.currentUser.id,
    );
    return success(statistics);
  }
}
