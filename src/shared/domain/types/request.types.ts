export interface RequestUser {
  id: string;
  memberId: string;
  email: string;
  nickname?: string;
  role: string;
}

export interface AuthenticatedRequest extends Request {
  user: RequestUser;
}

export interface PaginationRequest {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'ASC' | 'DESC';
}

export interface PaginationResponse<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface ErrorResponse {
  success: false;
  message: string;
  error?: string;
  statusCode: number;
}