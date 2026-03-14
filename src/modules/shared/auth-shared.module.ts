import { Global, Module } from '@nestjs/common';
import { AuthSessionService } from './services';

/**
 * AuthSharedModule
 *
 * 공유 인증 서비스들을 전역적으로 제공하는 모듈
 * - AuthSessionService: 세션 기반 인증 서비스
 */
@Global()
@Module({
  providers: [
    AuthSessionService,
  ],
  exports: [
    AuthSessionService,
  ],
})
export class AuthSharedModule {}