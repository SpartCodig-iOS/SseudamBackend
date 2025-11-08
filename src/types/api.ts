export interface ApiResponse<T> {
  code: number;
  data?: T;
  message?: string;
}

export const success = <T>(data: T, message = 'Success', code = 200): ApiResponse<T> => ({
  code,
  data,
  message,
});

export const failure = (message: string, code = 400): ApiResponse<[]> => ({
  code,
  data: [],
  message,
});
