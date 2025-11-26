import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../common/guards/auth.guard';
import { RequestWithUser } from '../../types/request';
import { success } from '../../types/api';
import { TravelExpenseService } from './travel-expense.service';
import { TravelExpenseDto } from '../travel/dto/travel-response.dto';
import { createExpenseSchema } from '../../validators/travelExpenseSchemas';

@ApiTags('Travel Expenses')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('api/v1/travels/:travelId/expenses')
export class TravelExpenseController {
  constructor(private readonly travelExpenseService: TravelExpenseService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '여행 지출 목록 조회' })
  @ApiOkResponse({ type: TravelExpenseDto, isArray: true })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  async list(@Param('travelId') travelId: string, @Req() req: RequestWithUser) {
    if (!req.currentUser) {
      throw new UnauthorizedException('Unauthorized');
    }
    const page = Number((req.query?.page as string) ?? '1') || 1;
    const limit = Number((req.query?.limit as string) ?? '20') || 20;
    const result = await this.travelExpenseService.listExpenses(travelId, req.currentUser.id, { page, limit });
    return success(result);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '여행 지출 추가' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['title', 'amount', 'currency', 'expenseDate'],
      properties: {
        title: { type: 'string', example: '라멘 식비', maxLength: 50, description: '지출 제목 (최대 50자)' },
        note: { type: 'string', example: '신주쿠역 인근', nullable: true },
        amount: { type: 'number', example: 3500, minimum: 0.01, description: '지출 금액 (필수, 양수)' },
        currency: { type: 'string', example: 'JPY', description: '지출 통화 (3자리 코드)' },
        expenseDate: { type: 'string', example: '2025-11-26', description: 'YYYY-MM-DD (오늘까지만 가능, 미래 날짜 불가)' },
        category: { type: 'string', example: 'food', maxLength: 20, pattern: '^[a-zA-Z0-9가-힣_-]+$', nullable: true, description: '카테고리 (영문/숫자/한글/_/- 만 가능, 최대 20자)' },
        participantIds: {
          type: 'array',
          items: { type: 'string', format: 'uuid' },
          minItems: 1,
          maxItems: 20,
          nullable: true,
          description: '지출 분배 대상 (1-20명, 중복 불가, 생략 시 모든 팀원)',
        },
      },
    },
  })
  @ApiOkResponse({ type: TravelExpenseDto })
  async create(
    @Param('travelId') travelId: string,
    @Body() body: unknown,
    @Req() req: RequestWithUser,
  ) {
    if (!req.currentUser) {
      throw new UnauthorizedException('Unauthorized');
    }
    const payload = createExpenseSchema.parse(body);
    const expense = await this.travelExpenseService.createExpense(travelId, req.currentUser.id, payload);
    return success(expense, 'Expense created');
  }

  @Delete(':expenseId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '여행 지출 삭제' })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        code: { type: 'number', example: 200 },
        message: { type: 'string', example: 'Expense deleted' },
        data: { type: 'null' }
      }
    }
  })
  async deleteExpense(
    @Param('travelId') travelId: string,
    @Param('expenseId') expenseId: string,
    @Req() req: RequestWithUser,
  ) {
    if (!req.currentUser) {
      throw new UnauthorizedException('Unauthorized');
    }
    await this.travelExpenseService.deleteExpense(travelId, expenseId, req.currentUser.id);
    return success(null, 'Expense deleted');
  }
}
