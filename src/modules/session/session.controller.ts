// TODO: SessionController는 SessionService 삭제로 인해 비활성화됨
// SessionService가 삭제되어 임시로 빈 컨트롤러로 대체

import { Controller } from '@nestjs/common';

@Controller('api/v1/session')
export class SessionController {
  // SessionService 삭제로 인해 비어있는 컨트롤러
  // 추후 새로운 세션 관리 시스템 구현 시 복구 예정
}
