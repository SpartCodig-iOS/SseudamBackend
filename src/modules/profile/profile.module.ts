/**
 * ProfileModule
 *
 * 사용자 프로필 조회/수정, 아바타 업로드를 담당한다.
 *
 * 이전 문제: CacheService, SupabaseService를 직접 provide해 중복 인스턴스 생성.
 * 개선:
 *   - CacheSharedModule(@Global) -> CacheService 자동 주입
 *   - AuthSharedModule -> SupabaseService export 활용
 */
import { Module } from '@nestjs/common';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { DatabaseModule } from '../database/database.module';
import { AuthSharedModule } from '../shared/auth-shared.module';

@Module({
  imports: [
    DatabaseModule,
    AuthSharedModule,
    // CacheSharedModule(@Global) -> CacheService 자동 주입
  ],
  controllers: [ProfileController],
  providers: [ProfileService],
  exports: [ProfileService],
})
export class ProfileModule {}
