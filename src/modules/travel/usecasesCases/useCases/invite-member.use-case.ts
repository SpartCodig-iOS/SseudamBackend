import { Injectable, Logger } from '@nestjs/common';
import { TravelService } from '../../services/travel.service';

export interface InviteMemberInput {
  travelId: string;
  inviterMemberId: number;
  inviteeEmail: string;
}

export interface InviteMemberOutput {
  success: boolean;
  message: string;
  inviteCode?: string;
  deepLink?: string;
}

@Injectable()
export class InviteMemberUseCase {
  private readonly logger = new Logger(InviteMemberUseCase.name);

  constructor(
    private readonly travelService: TravelService,
  ) {}

  async execute(input: InviteMemberInput): Promise<InviteMemberOutput> {
    try {
      this.logger.log('Executing invite member use case');

      // 비즈니스 로직: 멤버 초대 (초대 코드 생성)
      const result = await this.travelService.createInvite(
        input.travelId,
        input.inviterMemberId.toString()
      );

      return {
        success: true,
        message: 'Member invited successfully',
        inviteCode: result?.inviteCode,
        deepLink: result?.deepLink,
      };
    } catch (error) {
      this.logger.error('Invite member use case failed', error);
      throw error;
    }
  }
}