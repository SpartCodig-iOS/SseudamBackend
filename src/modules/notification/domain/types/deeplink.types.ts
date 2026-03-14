export enum DeepLinkType {
  EXPENSE_DETAIL = 'expense_detail',
  SETTLEMENT_RESULT = 'settlement_result',
  TRAVEL_INVITE = 'travel_invite',
  TRAVEL_DETAIL = 'travel_detail',
  TRAVEL_SETTINGS = 'travel_settings',
}

export interface DeepLinkData {
  type: DeepLinkType;
  travelId?: string;
  expenseId?: string;
  inviteCode?: string;
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  deeplink?: string;
  data?: Record<string, any>;
  badge?: number;
  sound?: string;
}