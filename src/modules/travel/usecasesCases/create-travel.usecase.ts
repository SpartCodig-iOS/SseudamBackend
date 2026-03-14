import { Injectable } from '@nestjs/common';
import { TravelService } from '../services/travel.service';

export interface CreateTravelData {
  memberId: number;
  title: string;
  description?: string;
  startDate: Date;
  endDate: Date;
  baseCurrency: string;
  baseExchangeRate: number;
}

@Injectable()
export class CreateTravelUseCase {
  constructor(private readonly travelService: TravelService) {}

  async execute(data: CreateTravelData) {
    // UserRecord 객체 생성 (임시)
    const currentUser = { id: data.memberId } as any;

    return this.travelService.createTravel(
      currentUser,
      {
        title: data.title,
        description: data.description,
        startDate: data.startDate,
        endDate: data.endDate,
        baseCurrency: data.baseCurrency,
        baseExchangeRate: data.baseExchangeRate,
      }
    );
  }
}