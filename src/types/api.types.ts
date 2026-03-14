export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp?: string;
  path?: string;
  statusCode?: number;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ErrorResponse extends ApiResponse {
  error: string;
  details?: any;
  stack?: string;
}

export interface SuccessResponse<T = any> extends ApiResponse<T> {
  success: true;
  data: T;
}

// iOS BaseResponse 호환 인터페이스 (MetaDTO 포함)
export interface MetaDTO {
  responseTime?: string;
  cached?: boolean;
}

export interface iOSBaseResponse<T = any> {
  code: number;           // HTTP status code
  data?: T;               // 실제 데이터 (optional)
  message: string;        // 메시지
  meta?: MetaDTO;         // MetaDTO (optional)
}

// iOS BaseResponse 호환 성공 응답 생성
export function success<T>(data: T, message?: string, statusCode: number = 200): iOSBaseResponse<T> {
  const startTime = Date.now();

  return {
    code: statusCode,
    data,
    message: message || 'Success',
    meta: {
      responseTime: `${Date.now() - startTime}ms`,
      cached: false,
    },
  };
}

// 에러 응답 생성 (iOS 호환)
export function error(message: string, statusCode: number = 500, data?: any): iOSBaseResponse<any> {
  return {
    code: statusCode,
    data: data || [],
    message,
    meta: {
      responseTime: '0ms',
      cached: false,
    },
  };
}