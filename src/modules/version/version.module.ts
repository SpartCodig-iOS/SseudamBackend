import { Module } from '@nestjs/common';
import { VersionController } from './version.controller';
import { VersionService } from './services/version.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [VersionController],
  providers: [VersionService],
})
export class VersionModule {}
