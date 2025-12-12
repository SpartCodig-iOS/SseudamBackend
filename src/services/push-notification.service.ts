import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { APNSService } from './apns.service';
import { DeviceTokenService } from './device-token.service';
import { DeepLinkType, DeepLinkData, DeepLinkUtils, PushNotificationPayload } from '../types/deeplink';

// 알림 이벤트 타입 정의
export interface ExpenseNotificationEvent {
  type: 'expense_added' | 'expense_updated' | 'expense_deleted';
  travelId: string;
  expenseId: string;   // 딥링크용 지출 ID 추가
  actorUserId: string; // 작업을 수행한 사용자 (알림에서 제외)
  actorName: string;   // 작업을 수행한 사용자 이름
  expenseTitle: string;
  amount?: number;
  currency?: string;
  memberIds: string[]; // 여행 멤버들 (actorUserId 포함)
}

export interface TravelNotificationEvent {
  type: 'travel_updated' | 'travel_member_added' | 'travel_member_removed';
  travelId: string;
  actorUserId: string;
  actorName: string;
  travelTitle: string;
  memberIds: string[];
}

@Injectable()
export class PushNotificationService {
  private readonly logger = new Logger(PushNotificationService.name);

  constructor(
    private readonly apnsService: APNSService,
    private readonly deviceTokenService: DeviceTokenService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // 알림 템플릿들
  private generateExpenseNotificationContent(event: ExpenseNotificationEvent): { title: string; body: string } {
    const formatAmount = (amount: number, currency: string) => {
      if (currency === 'KRW') return `${amount.toLocaleString()}원`;
      if (currency === 'JPY') return `${amount.toLocaleString()} JPY`;
      if (currency === 'USD') return `$${amount.toLocaleString()}`;
      return `${amount.toLocaleString()} ${currency}`;
    };

    switch (event.type) {
      case 'expense_added':
        return {
          title: '새 지출이 추가되었습니다',
          body: `${event.actorName}님이 "${event.expenseTitle}"을 추가했습니다${
            event.amount && event.currency ? ` (${formatAmount(event.amount, event.currency)})` : ''
          }`,
        };
      case 'expense_updated':
        return {
          title: '지출이 수정되었습니다',
          body: `${event.actorName}님이 "${event.expenseTitle}"을 수정했습니다`,
        };
      case 'expense_deleted':
        return {
          title: '지출이 삭제되었습니다',
          body: `${event.actorName}님이 "${event.expenseTitle}"을 삭제했습니다`,
        };
      default:
        return {
          title: '지출 변경 알림',
          body: `${event.actorName}님이 지출 내역을 변경했습니다`,
        };
    }
  }

  private generateTravelNotificationContent(event: TravelNotificationEvent): { title: string; body: string } {
    switch (event.type) {
      case 'travel_updated':
        return {
          title: '여행 정보가 수정되었습니다',
          body: `${event.actorName}님이 "${event.travelTitle}" 정보를 수정했습니다`,
        };
      case 'travel_member_added':
        return {
          title: '새 멤버가 추가되었습니다',
          body: `"${event.travelTitle}"에 새 멤버가 추가되었습니다`,
        };
      case 'travel_member_removed':
        return {
          title: '멤버가 여행에서 나갔습니다',
          body: `"${event.travelTitle}"에서 멤버가 나갔습니다`,
        };
      default:
        return {
          title: '여행 변경 알림',
          body: `${event.actorName}님이 여행 정보를 변경했습니다`,
        };
    }
  }

  // 지출 관련 이벤트 리스너
  @OnEvent('expense.added')
  async handleExpenseAdded(event: ExpenseNotificationEvent) {
    await this.sendNotificationToTravelMembers(event);
  }

  @OnEvent('expense.updated')
  async handleExpenseUpdated(event: ExpenseNotificationEvent) {
    await this.sendNotificationToTravelMembers(event);
  }

  @OnEvent('expense.deleted')
  async handleExpenseDeleted(event: ExpenseNotificationEvent) {
    await this.sendNotificationToTravelMembers(event);
  }

  // 여행 관련 이벤트 리스너
  @OnEvent('travel.updated')
  async handleTravelUpdated(event: TravelNotificationEvent) {
    await this.sendNotificationToTravelMembers(event);
  }

  @OnEvent('travel.member_added')
  async handleTravelMemberAdded(event: TravelNotificationEvent) {
    await this.sendNotificationToTravelMembers(event);
  }

  @OnEvent('travel.member_removed')
  async handleTravelMemberRemoved(event: TravelNotificationEvent) {
    await this.sendNotificationToTravelMembers(event);
  }

  // 딥링크 데이터 생성
  private createDeepLinkData(event: ExpenseNotificationEvent | TravelNotificationEvent): DeepLinkData {
    if ('expenseId' in event && event.expenseId) {
      // 지출 관련 이벤트 - 지출 상세로 이동
      return {
        type: DeepLinkType.EXPENSE_DETAIL,
        travelId: event.travelId,
        expenseId: event.expenseId,
      };
    } else {
      // 여행 관련 이벤트 - 여행 상세로 이동
      return {
        type: event.type === 'travel_updated' ? DeepLinkType.TRAVEL_SETTINGS : DeepLinkType.TRAVEL_DETAIL,
        travelId: event.travelId,
      };
    }
  }

  // 실제 알림 전송 로직 (딥링크 지원)
  private async sendNotificationToTravelMembers(event: ExpenseNotificationEvent | TravelNotificationEvent) {
    try {
      // 작업자 본인은 제외하고 다른 멤버들에게만 알림 전송
      const targetMemberIds = event.memberIds.filter(memberId => memberId !== event.actorUserId);

      if (targetMemberIds.length === 0) {
        this.logger.log('No target members for notification');
        return;
      }

      // 대상 멤버들의 디바이스 토큰 조회
      const deviceTokensByUser = await this.deviceTokenService.getActiveDeviceTokensForUsers(targetMemberIds);

      // 모든 디바이스 토큰 수집
      const allDeviceTokens: string[] = [];
      Object.values(deviceTokensByUser).forEach(tokens => {
        allDeviceTokens.push(...tokens);
      });

      if (allDeviceTokens.length === 0) {
        this.logger.log('No active device tokens found for notification');
        return;
      }

      // 알림 내용 생성
      const notificationContent = 'expenseTitle' in event
        ? this.generateExpenseNotificationContent(event)
        : this.generateTravelNotificationContent(event);

      // 딥링크 데이터 생성
      const deeplinkData = this.createDeepLinkData(event);

      // 푸시 알림 페이로드 생성
      const pushPayload: PushNotificationPayload = {
        title: notificationContent.title,
        body: notificationContent.body,
        data: {
          type: event.type,
          travelId: event.travelId,
          actorUserId: event.actorUserId,
          timestamp: new Date().toISOString(),
        },
      };

      // 딥링크가 포함된 APNS 페이로드 생성
      const apnsPayload = DeepLinkUtils.createPushPayload(pushPayload, deeplinkData);

      // 배치 전송 (새로운 딥링크 지원 메서드 사용)
      const results = await Promise.allSettled(
        allDeviceTokens.map(deviceToken =>
          this.apnsService.sendNotification({
            deviceToken,
            title: notificationContent.title,
            body: notificationContent.body,
            data: apnsPayload,
          })
        )
      );

      // 결과 집계
      const successCount = results.filter(r => r.status === 'fulfilled' && r.value).length;
      const failedCount = results.length - successCount;

      this.logger.log(`Notification sent with deeplinks: ${successCount} success, ${failedCount} failed`, {
        eventType: event.type,
        travelId: event.travelId,
        targetMemberCount: targetMemberIds.length,
        deviceTokenCount: allDeviceTokens.length,
        deeplink: DeepLinkUtils.generateDeepLink(deeplinkData),
      });

    } catch (error) {
      this.logger.error('Failed to send notification to travel members', {
        error: error instanceof Error ? error.message : String(error),
        eventType: event.type,
        travelId: event.travelId,
      });
    }
  }

  // 수동으로 알림 발송하는 헬퍼 메서드들
  async sendExpenseNotification(
    type: ExpenseNotificationEvent['type'],
    travelId: string,
    expenseId: string,  // 딥링크용 expenseId 추가
    actorUserId: string,
    actorName: string,
    expenseTitle: string,
    memberIds: string[],
    amount?: number,
    currency?: string,
  ) {
    this.eventEmitter.emit(`expense.${type.replace('expense_', '')}`, {
      type,
      travelId,
      expenseId,
      actorUserId,
      actorName,
      expenseTitle,
      amount,
      currency,
      memberIds,
    } as ExpenseNotificationEvent);
  }

  async sendTravelNotification(
    type: TravelNotificationEvent['type'],
    travelId: string,
    actorUserId: string,
    actorName: string,
    travelTitle: string,
    memberIds: string[],
  ) {
    this.eventEmitter.emit(`travel.${type.replace('travel_', '')}`, {
      type,
      travelId,
      actorUserId,
      actorName,
      travelTitle,
      memberIds,
    } as TravelNotificationEvent);
  }
}
