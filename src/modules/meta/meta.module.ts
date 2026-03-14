import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MetaController } from './meta.controller';
import { MetaService } from './services';
import { AppVersionRepository } from './repositories/app-version.repository';
import { AppVersion } from './entities/app-version.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AppVersion])],
  controllers: [MetaController],
  providers: [
    MetaService,
    AppVersionRepository,
  ],
  exports: [
    MetaService,
    AppVersionRepository,
  ],
})
export class MetaModule {}
