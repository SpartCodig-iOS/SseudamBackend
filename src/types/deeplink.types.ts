export interface DeeplinkData {
  type: 'travel' | 'expense' | 'settlement' | 'notification';
  id?: string | number;
  action?: string;
  params?: Record<string, any>;
  travelId?: string;
  expenseId?: string;
}

export interface PushNotificationDeeplink {
  url: string;
  data: DeeplinkData;
}

export enum DeeplinkType {
  TRAVEL_INVITE = 'travel_invite',
  EXPENSE_DETAIL = 'expense_detail',
  EXPENSE_ADDED = 'expense_added',
  SETTLEMENT_REQUEST = 'settlement_request',
  PAYMENT_REMINDER = 'payment_reminder',
  TRAVEL_DETAIL = 'travel_detail',
  TRAVEL_SETTINGS = 'travel_settings',
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  data?: Record<string, any>;
  badge?: number;
  sound?: string;
}

export const DEEPLINK_SCHEMES = {
  TRAVEL_INVITE: 'sseudam://travel/invite',
  EXPENSE_DETAIL: 'sseudam://expense',
  SETTLEMENT_DETAIL: 'sseudam://settlement',
  NOTIFICATION_CENTER: 'sseudam://notifications',
  TRAVEL_DETAIL: 'sseudam://travel',
  TRAVEL_SETTINGS: 'sseudam://travel/settings',
} as const;

export const DeepLinkUtils = {
  generateDeepLink: (data: DeeplinkData): string => {
    if (data.type === 'expense' && data.expenseId) {
      return `${DEEPLINK_SCHEMES.EXPENSE_DETAIL}?id=${data.expenseId}&travelId=${data.travelId}`;
    }
    if (data.type === 'travel' && data.travelId) {
      return `${DEEPLINK_SCHEMES.TRAVEL_DETAIL}?id=${data.travelId}`;
    }
    return DEEPLINK_SCHEMES.NOTIFICATION_CENTER;
  },

  createPushPayload: (payload: PushNotificationPayload, deeplink: DeeplinkData): PushNotificationPayload => {
    return {
      ...payload,
      data: {
        ...payload.data,
        deeplink: DeepLinkUtils.generateDeepLink(deeplink),
      },
    };
  },
};