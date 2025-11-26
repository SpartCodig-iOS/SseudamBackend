import { Module } from '@nestjs/common';
import { DevController } from './dev.controller';
import { JwtTokenService } from '../../services/jwtService';

@Module({
  controllers: [DevController],
  providers: [JwtTokenService],
})
export class DevModule {}