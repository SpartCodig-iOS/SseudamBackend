import { Injectable, Logger } from '@nestjs/common';
import { TravelService } from '../../services/travel.service';

export interface DeleteTravelInput {
  travelId: string;
  memberId: number;
}

export interface DeleteTravelOutput {
  success: boolean;
  message: string;
}

@Injectable()
export class DeleteTravelUseCase {
  private readonly logger = new Logger(DeleteTravelUseCase.name);

  constructor(
    private readonly travelService: TravelService,
  ) {}

  async execute(input: DeleteTravelInput): Promise<DeleteTravelOutput> {
    try {
      this.logger.log('Executing delete travel use case');

      // 비즈니스 로직: 여행 삭제
      await this.travelService.deleteTravel(input.travelId, input.memberId);

      return {
        success: true,
        message: 'Travel deleted successfully',
      };
    } catch (error) {
      this.logger.error('Delete travel use case failed', error);
      throw error;
    }
  }
}