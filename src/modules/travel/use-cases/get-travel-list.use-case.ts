import { Injectable, Inject } from '@nestjs/common';
import { TravelService } from '../services/travel.service';

export interface GetTravelListInput {
  userId: string;
  page?: number;
  limit?: number;
  status?: 'active' | 'archived';
}

export interface GetTravelListOutput {
  travels: any[];
  pagination: {
    total: number;
    page: number;
    limit: number;
  };
}

@Injectable()
export class GetTravelListUseCase {
  constructor(
    private readonly travelService: TravelService,
  ) {}

  async execute(input: GetTravelListInput): Promise<GetTravelListOutput> {
    const result = await this.travelService.listTravels(input.userId, {
      page: input.page,
      limit: input.limit,
      status: input.status,
    });

    return {
      travels: result.items,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
      },
    };
  }
}