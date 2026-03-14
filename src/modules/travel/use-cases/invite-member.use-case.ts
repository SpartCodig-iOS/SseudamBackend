import { Injectable } from '@nestjs/common';
import { TravelService } from '../services/travel.service';

@Injectable()
export class InviteMemberUseCase {
  constructor(private readonly travelService: TravelService) {}

  async execute(userId: string, inviteCode: string): Promise<any> {
    return this.travelService.joinByInviteCode(userId, inviteCode);
  }
}