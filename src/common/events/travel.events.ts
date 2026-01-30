// 🎯 여행 관련 이벤트 타입들
export interface TravelCreatedEvent {
  travelId: string;
  title: string;
  ownerId: string;
  ownerName: string;
  memberIds: string[];
}

export interface MemberInvitedEvent {
  travelId: string;
  travelTitle: string;
  invitedUserId: string;
  invitedByUserId: string;
  invitedByName: string;
  inviteCode: string;
}

export interface ExpenseAddedEvent {
  travelId: string;
  expenseId: string;
  title: string;
  amount: number;
  currency: string;
  convertedAmount: number;
  payerId: string;
  payerName: string;
  participantIds: string[];
}

export interface SettlementRecalculateEvent {
  travelId: string;
  triggeredBy: string; // 'expense_added' | 'expense_updated' | 'expense_deleted'
  triggerDetails: {
    expenseId?: string;
    amount?: number;
  };
}

export interface PushNotificationEvent {
  userIds: string[];
  title: string;
  body: string;
  data?: Record<string, any>;
  badge?: number;
}

// 🔥 Queue 작업 데이터 타입들
export interface NotificationJobData extends PushNotificationEvent {}

export interface SettlementJobData extends SettlementRecalculateEvent {}

export interface EmailJobData {
  to: string[];
  subject: string;
  template: string;
  context: Record<string, any>;
}