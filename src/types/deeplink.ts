export enum DeepLinkType {
  EXPENSE_DETAIL = 'expense_detail',
  SETTLEMENT_RESULT = 'settlement_result',
  TRAVEL_INVITE = 'travel_invite',
  TRAVEL_DETAIL = 'travel_detail',
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

export class DeepLinkUtils {
  private static readonly BASE_SCHEME = 'sseudam://';

  /**
   * 딥링크 URL 생성
   * @param data 딥링크 데이터
   * @returns 생성된 딥링크 URL
   */
  static generateDeepLink(data: DeepLinkData): string {
    switch (data.type) {
      case DeepLinkType.EXPENSE_DETAIL:
        if (!data.travelId || !data.expenseId) {
          throw new Error('travelId and expenseId are required for expense detail deeplink');
        }
        return `${this.BASE_SCHEME}travel/${data.travelId}/expense/${data.expenseId}`;

      case DeepLinkType.SETTLEMENT_RESULT:
        if (!data.travelId) {
          throw new Error('travelId is required for settlement result deeplink');
        }
        return `${this.BASE_SCHEME}travel/${data.travelId}/settlement`;

      case DeepLinkType.TRAVEL_INVITE:
        if (!data.inviteCode) {
          throw new Error('inviteCode is required for travel invite deeplink');
        }
        return `${this.BASE_SCHEME}invite?code=${data.inviteCode}`;

      case DeepLinkType.TRAVEL_DETAIL:
        if (!data.travelId) {
          throw new Error('travelId is required for travel detail deeplink');
        }
        return `${this.BASE_SCHEME}travel/${data.travelId}`;

      default:
        throw new Error(`Unsupported deeplink type: ${data.type}`);
    }
  }

  /**
   * 딥링크 페이로드 생성 (푸시 알림용)
   * @param payload 기본 푸시 알림 정보
   * @param deeplinkData 딥링크 데이터
   * @returns APNS 페이로드
   */
  static createPushPayload(payload: PushNotificationPayload, deeplinkData?: DeepLinkData): Record<string, any> {
    const apsPayload: Record<string, any> = {
      alert: {
        title: payload.title,
        body: payload.body,
      },
      sound: payload.sound || 'default',
    };

    if (payload.badge !== undefined) {
      apsPayload.badge = payload.badge;
    }

    const fullPayload: Record<string, any> = {
      aps: apsPayload,
    };

    // 딥링크 데이터 추가
    if (deeplinkData) {
      const deeplink = this.generateDeepLink(deeplinkData);
      fullPayload.deeplink = deeplink;
      fullPayload.deeplinkType = deeplinkData.type;

      // 추가 메타데이터
      if (deeplinkData.travelId) {
        fullPayload.travelId = deeplinkData.travelId;
      }
      if (deeplinkData.expenseId) {
        fullPayload.expenseId = deeplinkData.expenseId;
      }
      if (deeplinkData.inviteCode) {
        fullPayload.inviteCode = deeplinkData.inviteCode;
      }
    }

    // 추가 커스텀 데이터
    if (payload.data) {
      Object.assign(fullPayload, payload.data);
    }

    return fullPayload;
  }
}