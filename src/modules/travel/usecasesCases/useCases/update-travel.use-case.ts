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
      const result = await this.travelService.updateTravel(input.travelId, input.memberId, {
        title: input.title,
        description: input.description,
        startDate: input.startDate,
        endDate: input.endDate,
        baseCurrency: input.baseCurrency,
        baseExchangeRate: input.baseExchangeRate,
        countryCode: input.countryCode,
        destinationCurrency: input.destinationCurrency,
        budget: input.budget,
        budgetCurrency: input.budgetCurrency,
      });

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