import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '../../common/guards/auth.guard';
import { RequestWithUser } from '../../types/request.types';
import { success } from '../../types/api.types';
import { TravelExpenseService } from './services/travel-expense.service';

@ApiTags('Travel Expense')
@Controller('api/v1/travel-expenses')
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class TravelExpenseController {
  private readonly logger = new Logger(TravelExpenseController.name);

  constructor(
    private readonly travelExpenseService: TravelExpenseService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create new travel expense' })
  @ApiOkResponse({ description: 'Travel expense created successfully' })
  async createExpense(
    @Body() body: any,
    @Req() req: RequestWithUser,
  ) {
    try {
      // travelId를 body에서 가져오거나 기본값 사용
      const travelId = body.travelId || 'default-travel-id';
      const result = await this.travelExpenseService.createExpense(travelId, req.user.id, body);
      return success(result, 'Travel expense created successfully');
    } catch (error) {
      this.logger.error('Failed to create travel expense', error);
      throw error;
    }
  }

  // @Get(':id')
  // @HttpCode(HttpStatus.OK)
  // @ApiOperation({ summary: 'Get travel expense by ID' })
  // @ApiOkResponse({ description: 'Travel expense retrieved successfully' })
  // async getExpense(
  //   @Param('id') id: string,
  //   @Req() req: RequestWithUser,
  // ) {
  //   try {
  //     const result = await this.travelExpenseService.getExpense(id, req.user.id);
  //     return success(result, 'Travel expense retrieved successfully');
  //   } catch (error) {
  //     this.logger.error('Failed to get travel expense', error);
  //     throw error;
  //   }
  // }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update travel expense' })
  @ApiOkResponse({ description: 'Travel expense updated successfully' })
  async updateExpense(
    @Param('id') id: string,
    @Body() body: any,
    @Req() req: RequestWithUser,
  ) {
    try {
      // travelId를 body에서 가져오거나 기본값 사용
      const travelId = body.travelId || 'default-travel-id';
      const result = await this.travelExpenseService.updateExpense(travelId, id, req.user.id, body);
      return success(result, 'Travel expense updated successfully');
    } catch (error) {
      this.logger.error('Failed to update travel expense', error);
      throw error;
    }
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete travel expense' })
  @ApiOkResponse({ description: 'Travel expense deleted successfully' })
  async deleteExpense(
    @Param('id') id: string,
    @Req() req: RequestWithUser,
  ) {
    try {
      // travelId를 임시로 기본값 사용 (향후 URL에서 가져오도록 수정 필요)
      const travelId = 'default-travel-id';
      await this.travelExpenseService.deleteExpense(travelId, id, req.user.id);
      return success(null, 'Travel expense deleted successfully');
    } catch (error) {
      this.logger.error('Failed to delete travel expense', error);
      throw error;
    }
  }
}