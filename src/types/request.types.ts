import { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  user?: any;
  sessionId?: string;
  memberId?: number;
  deviceId?: string;
  roles?: string[];
}

export interface RequestWithUser extends Request {
  user: {
    id: string; // number에서 string으로 변경
    email: string;
    roles?: string[];
    memberId?: number;
    tokenId: string; // tokenId 추가
  };
  currentUser?: {
    id: string;
    email: string;
    name?: string | null;
    role?: string;
  };
  loginType?: string;
}

export interface ApiRequest extends Request {
  startTime?: number;
  correlationId?: string;
  apiVersion?: string;
}