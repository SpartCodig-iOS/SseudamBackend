import { Module } from '@nestjs/common';
import { TravelController } from './travel.controller';
import { TravelService } from './travel.service';

@Module({
  controllers: [TravelController],
  providers: [TravelService],
  exports: [TravelService],
})
export class TravelModule {}
