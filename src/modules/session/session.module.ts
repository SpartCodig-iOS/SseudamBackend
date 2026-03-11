import { Module } from '@nestjs/common';
import { SessionController } from './session.controller';
import { AuthSharedModule } from '../shared/auth-shared.module';

@Module({
  imports: [AuthSharedModule],  // SessionService 주입
  controllers: [SessionController],
})
export class SessionModule {}
