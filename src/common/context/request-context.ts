/**
 * RequestContext
 *
 * AsyncLocalStorage 기반 요청 컨텍스트 관리.
 * 하나의 HTTP 요청 생명주기 동안 requestId와 userId를
 * 어디서든 꺼낼 수 있게 한다 (Constructor injection 없이).
 *
 * 사용 예:
 *   RequestContext.getRequestId()   // 현재 요청의 ID
 *   RequestContext.getUserId()      // 현재 요청의 인증된 사용자 ID
 */
import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';

export interface RequestStore {
  requestId: string;
  userId?: string;
  startTime: bigint;
}

const storage = new AsyncLocalStorage<RequestStore>();

export const RequestContext = {
  /**
   * 새 요청 컨텍스트를 생성하고 callback 내에서 실행한다.
   * NestJS 미들웨어에서 호출해야 한다.
   */
  run<T>(store: Omit<RequestStore, 'startTime'> & { requestId?: string }, callback: () => T): T {
    const requestStore: RequestStore = {
      requestId: store.requestId ?? randomUUID(),
      userId: store.userId,
      startTime: process.hrtime.bigint(),
    };
    return storage.run(requestStore, callback);
  },

  /**
   * 현재 컨텍스트의 requestId를 반환한다.
   * 컨텍스트가 없으면 'unknown'을 반환한다.
   */
  getRequestId(): string {
    return storage.getStore()?.requestId ?? 'unknown';
  },

  /**
   * 현재 컨텍스트의 userId를 반환한다.
   * 인증 전이거나 컨텍스트가 없으면 undefined를 반환한다.
   */
  getUserId(): string | undefined {
    return storage.getStore()?.userId;
  },

  /**
   * 현재 컨텍스트에 userId를 설정한다.
   * AuthGuard 통과 후 호출한다.
   */
  setUserId(userId: string): void {
    const store = storage.getStore();
    if (store) {
      store.userId = userId;
    }
  },

  /**
   * 현재 요청의 경과 시간(ms)을 반환한다.
   */
  getElapsedMs(): number {
    const store = storage.getStore();
    if (!store) return 0;
    return Number(process.hrtime.bigint() - store.startTime) / 1_000_000;
  },

  /**
   * 현재 store 전체를 반환한다.
   */
  getStore(): RequestStore | undefined {
    return storage.getStore();
  },
};
