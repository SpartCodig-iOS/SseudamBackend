import { Injectable, Logger } from '@nestjs/common';
import { TravelService } from '../../services/travel.service';

export interface UpdateTravelInput {
  travelId: string;
  memberId: number;
  title?: string;
  description?: string;
  startDate?: Date;
  endDate?: Date;
  baseCurrency?: string;
  baseExchangeRate?: number;
  countryCode?: string;
  destinationCurrency?: string;
  budget?: number;
  budgetCurrency?: string;
}

export interface UpdateTravelOutput {
  success: boolean;
  message: string;
  travel: any;
}

@Injectable()
export class UpdateTravelUseCase {
  private readonly logger = new Logger(UpdateTravelUseCase.name);

  constructor(
    private readonly travelService: TravelService,
  ) {}

  async execute(input: UpdateTravelInput): Promise<UpdateTravelOutput> {
    try {
      this.logger.log('Executing update travel use case');

      // 비즈니스 로직: 여행 수정
      const updateData: any = {};
      if (input.title !== undefined) updateData.title = input.title;
      if (input.description !== undefined) updateData.description = input.description;
      if (input.startDate !== undefined) updateData.startDate = input.startDate;
      if (input.endDate !== undefined) updateData.endDate = input.endDate;
      if (input.baseCurrency !== undefined) updateData.baseCurrency = input.baseCurrency;
      if (input.baseExchangeRate !== undefined) updateData.baseExchangeRate = input.baseExchangeRate;
      if (input.countryCode !== undefined) updateData.countryCode = input.countryCode;
      if (input.destinationCurrency !== undefined) updateData.destinationCurrency = input.destinationCurrency;
      if (input.budget !== undefined) updateData.budget = input.budget;
      if (input.budgetCurrency !== undefined) updateData.budgetCurrency = input.budgetCurrency;

      const result = await this.travelService.updateTravel(input.travelId, input.memberId.toString(), updateData);

      return {
        success: true,
        message: 'Travel updated successfully',
        travel: result,
      };
    } catch (error) {
      this.logger.error('Update travel use case failed', error);
      throw error;
    }
  }
}