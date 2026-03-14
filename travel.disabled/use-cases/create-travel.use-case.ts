import { Injectable } from '@nestjs/common';
import { TravelService } from '../services/travel.service';
import { UserRecord } from '../../../types/user.types';

@Injectable()
export class CreateTravelUseCase {
  constructor(private readonly travelService: TravelService) {}

  async execute(userRecord: UserRecord, travelData: any): Promise<any> {
    return this.travelService.createTravel(userRecord, travelData);
  }
}