import { Module } from '@nestjs/common';
import { DevController } from './dev.controller';
import { SharedModule } from '../shared/shared.module';
import { env } from '../../config/env';

@Module({
  imports: [SharedModule],
  // DevController는 개발/스테이징 환경에서만 등록
  controllers: env.nodeEnv !== 'production' ? [DevController] : [],
})
export class DevModule {}