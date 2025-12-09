import { Module } from '@nestjs/common';
import { DevController } from './dev.controller';
import { SharedModule } from '../shared/shared.module';

@Module({
  imports: [SharedModule],
  controllers: [DevController],
})
export class DevModule {}