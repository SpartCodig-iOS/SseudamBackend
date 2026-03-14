import { Injectable } from '@nestjs/common';
import { TravelService } from '../services/travel.service';

@Injectable()
export class DeleteTravelUseCase {
  constructor(private readonly travelService: TravelService) {}

  async execute(travelId: string, userId: string): Promise<any> {
    return this.travelService.deleteTravel(travelId, userId);
  }
}