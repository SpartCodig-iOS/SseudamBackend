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
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create new travel' })
  @ApiOkResponse({ description: 'Travel created successfully' })
  async createTravel(
    @Body() body: CreateTravelDto,
    @Req() req: RequestWithUser,
  ) {
    try {
      const result = await this.createTravelUseCase.execute({
        memberId: req.user.id,
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
      const result = await this.inviteMemberUseCase.execute({
        travelId,
        inviterMemberId: req.user.id,
        inviteeEmail: body.email,
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
      const result = await this.updateTravelUseCase.execute({
        travelId,
        memberId: req.user.id,
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
      const result = await this.deleteTravelUseCase.execute({
        travelId,
        memberId: req.user.id,
      });

      return success(result, 'Travel deleted successfully');
    } catch (error) {
      this.logger.error('Failed to delete travel', error);
      throw error;
    }
  }
}