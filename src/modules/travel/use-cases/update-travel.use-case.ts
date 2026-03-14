import { Injectable } from '@nestjs/common';
import { TravelService } from '../services/travel.service';

@Injectable()
export class UpdateTravelUseCase {
  constructor(private readonly travelService: TravelService) {}

  async execute(travelId: string, userId: string, updateData: any): Promise<any> {
    return this.travelService.updateTravel(travelId, userId, updateData);
  }
}