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
import { CreateTravelDto, UpdateTravelDto, InviteMemberDto } from './dto/create-travel.dto';

// Use Cases
import {
  CreateTravelUseCase,
  InviteMemberUseCase,
  UpdateTravelUseCase,
  DeleteTravelUseCase,
  GetTravelListUseCase,
} from './use-cases';

@ApiTags('Travel')
@Controller('api/v1/travels')
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class TravelController {
  private readonly logger = new Logger(TravelController.name);

  constructor(
    private readonly createTravelUseCase: CreateTravelUseCase,
    private readonly inviteMemberUseCase: InviteMemberUseCase,
    private readonly updateTravelUseCase: UpdateTravelUseCase,
    private readonly deleteTravelUseCase: DeleteTravelUseCase,
    private readonly getTravelListUseCase: GetTravelListUseCase,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get travel list' })
  @ApiOkResponse({ description: 'Travel list retrieved successfully' })
  async getTravelList(
    @Req() req: RequestWithUser,
    @Query('limit') limit?: string,
    @Query('page') page?: string,
    @Query('status') status?: string,
  ) {
    try {
      // 기본값 설정
      const pageNum = page ? parseInt(page) : 1;
      const limitNum = limit ? parseInt(limit) : 20;
      const statusFilter = status === 'active' || status === 'archived' ? status : undefined;

      // GetTravelListUseCase를 사용해서 실제 여행 목록 조회
      const result = await this.getTravelListUseCase.execute({
        userId: req.currentUser!.id,
        page: pageNum,
        limit: limitNum,
        status: statusFilter,
      });

      return success(result, 'Travel list retrieved successfully');
    } catch (error) {
      this.logger.error('Failed to get travel list', error);
      throw error;
    }
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get travel detail' })
  @ApiOkResponse({ description: 'Travel detail retrieved successfully' })
  async getTravelDetail(
    @Param('id') travelId: string,
    @Req() req: RequestWithUser,
  ) {
    try {
      // TODO: TravelService에서 여행 상세 조회 구현
      const result = {
        id: travelId,
        title: 'Sample Travel',
        description: 'Sample description',
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        countryCode: 'KR',
        countryNameKr: '대한민국',
        baseCurrency: 'KRW',
        baseExchangeRate: 1,
        destinationCurrency: 'KRW',
        countryCurrencies: ['KRW'],
        budget: 1000000,
        budgetCurrency: 'KRW',
        members: [],
        inviteCode: 'sample123',
      };

      return success(result, 'Travel detail retrieved successfully');
    } catch (error) {
      this.logger.error('Failed to get travel detail', error);
      throw error;
    }
  }

  @Get(':id/expenses')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get travel expenses' })
  @ApiOkResponse({ description: 'Travel expenses retrieved successfully' })
  async getTravelExpenses(
    @Param('id') travelId: string,
    @Req() req: RequestWithUser,
  ) {
    try {
      // TODO: TravelExpenseService에서 경비 목록 조회 구현
      const result = {
        expenses: [],
        totalAmount: 0,
        currency: 'KRW',
      };

      return success(result, 'Travel expenses retrieved successfully');
    } catch (error) {
      this.logger.error('Failed to get travel expenses', error);
      throw error;
    }
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create new travel' })
  @ApiOkResponse({ description: 'Travel created successfully' })
  async createTravel(
    @Body() body: CreateTravelDto,
    @Req() req: RequestWithUser,
  ) {
    try {
      // 최소한의 UserRecord 생성
      const userRecord = {
        ...req.currentUser!,
        name: req.currentUser!.name || null,
        role: req.currentUser!.role || 'user',
        avatar_url: null,
        username: req.currentUser!.email,
        password_hash: '',
        created_at: new Date(),
        updated_at: new Date(),
      };

      const result = await this.createTravelUseCase.execute(userRecord, {
        title: body.title,
        description: body.description,
        startDate: new Date(body.startDate),
        endDate: new Date(body.endDate),
        baseCurrency: body.baseCurrency,
        baseExchangeRate: body.baseExchangeRate,
        countryCode: body.countryCode,
        destinationCurrency: body.destinationCurrency,
        budget: body.budget,
        budgetCurrency: body.budgetCurrency,
        countryNameKr: body.countryNameKr,
        countryCurrencies: body.countryCurrencies,
      });

      return success(result, 'Travel created successfully');
    } catch (error) {
      this.logger.error('Failed to create travel', error);
      throw error;
    }
  }

  @Post(':id/invite')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Invite member to travel' })
  @ApiOkResponse({ description: 'Member invited successfully' })
  async inviteMember(
    @Param('id') travelId: string,
    @Body() body: { email: string },
    @Req() req: RequestWithUser,
  ) {
    try {
      const result = await this.inviteMemberUseCase.execute((req.currentUser!).id.toString(), {
        travelId,
      });

      return success(result, 'Member invited successfully');
    } catch (error) {
      this.logger.error('Failed to invite member', error);
      throw error;
    }
  }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update travel' })
  @ApiOkResponse({ description: 'Travel updated successfully' })
  async updateTravel(
    @Param('id') travelId: string,
    @Body() body: any,
    @Req() req: RequestWithUser,
  ) {
    try {
      const result = await this.updateTravelUseCase.execute(travelId, (req.currentUser!).id.toString(), {
        title: body.title,
        description: body.description,
        startDate: body.startDate ? new Date(body.startDate) : undefined,
        endDate: body.endDate ? new Date(body.endDate) : undefined,
        baseCurrency: body.baseCurrency,
        baseExchangeRate: body.baseExchangeRate,
        countryCode: body.countryCode,
        destinationCurrency: body.destinationCurrency,
        budget: body.budget,
        budgetCurrency: body.budgetCurrency,
        countryNameKr: body.countryNameKr,
        countryCurrencies: body.countryCurrencies,
      });

      return success(result, 'Travel updated successfully');
    } catch (error) {
      this.logger.error('Failed to update travel', error);
      throw error;
    }
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete travel' })
  @ApiOkResponse({ description: 'Travel deleted successfully' })
  async deleteTravel(
    @Param('id') travelId: string,
    @Req() req: RequestWithUser,
  ) {
    try {
      const result = await this.deleteTravelUseCase.execute(travelId, (req.currentUser!).id.toString());

      return success(result, 'Travel deleted successfully');
    } catch (error) {
      this.logger.error('Failed to delete travel', error);
      throw error;
    }
  }
}