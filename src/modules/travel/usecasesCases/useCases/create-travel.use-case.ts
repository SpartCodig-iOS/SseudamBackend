import { Injectable, Logger } from '@nestjs/common';
import { TravelService } from '../../services/travel.service';

export interface CreateTravelInput {
  memberId: number;
  title: string;
  description?: string;
  startDate: Date;
  endDate: Date;
  baseCurrency: string;
  baseExchangeRate: number;
  countryCode?: string;
  destinationCurrency?: string;
  budget?: number;
  budgetCurrency?: string;
}

export interface CreateTravelOutput {
  id: string;
  title: string;
  inviteCode: string;
  deepLink: string;
  success: boolean;
}

@Injectable()
export class CreateTravelUseCase {
  private readonly logger = new Logger(CreateTravelUseCase.name);

  constructor(
    private readonly travelService: TravelService,
  ) {}

  async execute(input: CreateTravelInput): Promise<CreateTravelOutput> {
    try {
      this.logger.log('Executing create travel use case');

      // 비즈니스 로직: 여행 생성
      const currentUser = { id: input.memberId } as any;
      const result = await this.travelService.createTravel(currentUser, {
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
        id: result.id,
        title: result.title,
        inviteCode: result.inviteCode || '',
        deepLink: result.deepLink || '',
        success: true,
      };
    } catch (error) {
      this.logger.error('Create travel use case failed', error);
      throw error;
    }
  }
}