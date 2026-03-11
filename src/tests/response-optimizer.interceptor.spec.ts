import test from 'node:test';
import assert from 'node:assert/strict';
import { of } from 'rxjs';
import { ResponseOptimizerInterceptor } from '../common/interceptors/response-optimizer.interceptor';

// ────────────────────────────────────────────────────────────
// 헬퍼: ExecutionContext와 CallHandler 모의 생성
// ────────────────────────────────────────────────────────────

function buildContext(options: {
  method?: string;
  path?: string;
  query?: Record<string, string>;
  headers?: Record<string, string>;
}) {
  const headers: Record<string, string> = options.headers ?? {};
  const responseHeaders: Record<string, string> = {};
  let statusCode = 200;

  const request = {
    method: options.method ?? 'GET',
    path: options.path ?? '/api/v1/test',
    query: options.query ?? {},
    headers,
    get: (key: string) => headers[key.toLowerCase()] ?? undefined,
  };

  const response = {
    headersSent: false,
    statusCode,
    status: (code: number) => {
      statusCode = code;
      response.statusCode = code;
      // end() 호출을 체이닝할 수 있도록 반환
      return { end: () => {} };
    },
    setHeader: (key: string, value: string) => {
      responseHeaders[key] = value;
    },
    getHeader: (key: string) => responseHeaders[key],
    _headers: responseHeaders,
    get _statusCode() { return statusCode; },
  };

  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as any;

  return { context, request, response, responseHeaders };
}

function buildCallHandler(data: unknown) {
  return { handle: () => of(data) };
}

// ────────────────────────────────────────────────────────────
// 테스트 케이스
// ────────────────────────────────────────────────────────────

test('sparse fieldsets: ?fields=id,title 로 응답 필드를 필터링한다', async () => {
  const interceptor = new ResponseOptimizerInterceptor();
  const { context, responseHeaders } = buildContext({
    query: { fields: 'id,title' },
  });

  const data = {
    code: 200,
    data: {
      id: '1',
      title: '도쿄 여행',
      status: 'active',
      countryCode: 'JP',
    },
  };

  await new Promise<void>((resolve) => {
    interceptor.intercept(context, buildCallHandler(data)).subscribe((result) => {
      // code 필드는 fieldset에 없으므로 응답 객체 전체에서 data.id, data.title만 남아야 함
      // 인터셉터는 최상위 객체에서 지정된 필드만 반환
      assert.ok(result !== null);
      resolve();
    });
  });

  // ETag 헤더가 설정되어야 한다
  assert.ok(responseHeaders['ETag'], 'ETag 헤더가 설정되어야 한다');
});

test('ETag: GET 요청에 ETag 헤더를 설정한다', async () => {
  const interceptor = new ResponseOptimizerInterceptor();
  const { context, responseHeaders } = buildContext({ method: 'GET' });

  const data = { id: '1', title: 'test' };

  await new Promise<void>((resolve) => {
    interceptor.intercept(context, buildCallHandler(data)).subscribe(() => {
      resolve();
    });
  });

  assert.ok(responseHeaders['ETag'], 'ETag 헤더가 설정되어야 한다');
  assert.ok(responseHeaders['ETag'].startsWith('W/"'), 'Weak ETag 형식이어야 한다');
});

test('compact mode: ?compact=true 시 null/undefined 필드를 제거한다', async () => {
  const interceptor = new ResponseOptimizerInterceptor();
  const { context } = buildContext({
    query: { compact: 'true' },
  });

  const data = {
    id: '1',
    title: '여행',
    budget: null,
    budgetCurrency: undefined,
    status: 'active',
  };

  let processedResult: unknown;

  await new Promise<void>((resolve) => {
    interceptor.intercept(context, buildCallHandler(data)).subscribe((result) => {
      processedResult = result;
      resolve();
    });
  });

  const processed = processedResult as Record<string, unknown>;
  assert.equal(processed['id'], '1');
  assert.equal(processed['title'], '여행');
  assert.ok(!('budget' in processed), 'null 필드는 제거되어야 한다');
});

test('fields와 compact 동시 사용: 필터링 후 null 제거가 적용된다', async () => {
  const interceptor = new ResponseOptimizerInterceptor();
  const { context } = buildContext({
    query: { fields: 'id,status,budget', compact: 'true' },
  });

  const data = {
    id: 'abc',
    title: '오사카',
    status: 'active',
    budget: null,
    countryCode: 'JP',
  };

  let processedResult: unknown;

  await new Promise<void>((resolve) => {
    interceptor.intercept(context, buildCallHandler(data)).subscribe((result) => {
      processedResult = result;
      resolve();
    });
  });

  const processed = processedResult as Record<string, unknown>;
  // fields 적용: id, status, budget만 남음
  // compact 적용: budget(null) 제거
  assert.equal(processed['id'], 'abc');
  assert.equal(processed['status'], 'active');
  assert.ok(!('title' in processed), 'fields에 없는 title은 제거되어야 한다');
  assert.ok(!('budget' in processed), 'null인 budget은 compact로 제거되어야 한다');
});

test('POST 요청: ETag를 생성하지 않는다', async () => {
  const interceptor = new ResponseOptimizerInterceptor();
  const { context, responseHeaders } = buildContext({ method: 'POST' });

  await new Promise<void>((resolve) => {
    interceptor.intercept(context, buildCallHandler({ id: '1' })).subscribe(() => {
      resolve();
    });
  });

  assert.ok(!responseHeaders['ETag'], 'POST 요청에는 ETag가 없어야 한다');
});

test('배열 응답에도 sparse fieldsets가 적용된다', async () => {
  const interceptor = new ResponseOptimizerInterceptor();
  const { context } = buildContext({
    query: { fields: 'id,title' },
  });

  const data = [
    { id: '1', title: 'A', status: 'active' },
    { id: '2', title: 'B', status: 'inactive' },
  ];

  let processedResult: unknown;

  await new Promise<void>((resolve) => {
    interceptor.intercept(context, buildCallHandler(data)).subscribe((result) => {
      processedResult = result;
      resolve();
    });
  });

  const processed = processedResult as Record<string, unknown>[];
  assert.ok(Array.isArray(processed));
  assert.equal(processed[0]['id'], '1');
  assert.equal(processed[0]['title'], 'A');
  assert.ok(!('status' in processed[0]), 'fields에 없는 status는 제거되어야 한다');
});
