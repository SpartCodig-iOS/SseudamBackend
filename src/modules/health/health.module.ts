/**
 * HealthModule
 *
 * 간단한 헬스체크 엔드포인트를 제공한다.
 * 복잡한 의존성 없이 기본 서버 상태만 체크한다.
 */
import { Module } from '@nestjs/common';
import { SimpleHealthController } from './simple-health.controller';

@Module({
  controllers: [SimpleHealthController],
})
export class HealthModule {}
