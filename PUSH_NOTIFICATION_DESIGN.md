# 푸시 알림 시스템 설계

## 📋 요구사항
1. **지출 내역 추가** 시 멤버들에게 푸시 알림
2. **지출 내역 수정** 시 멤버들에게 푸시 알림
3. **지출 내역 삭제** 시 멤버들에게 푸시 알림
4. **여행 정보 수정** 시 멤버들에게 푸시 알림

## 🏗️ 시스템 아키텍처

### 1. 푸시 토큰 관리
```typescript
interface DeviceToken {
  id: string;
  userId: string;
  deviceToken: string; // FCM/APNS 토큰
  platform: 'ios' | 'android';
  isActive: boolean;
  lastUsedAt: Date;
  createdAt: Date;
}
```

### 2. 알림 템플릿 시스템
```typescript
interface NotificationTemplate {
  type: 'expense_added' | 'expense_updated' | 'expense_deleted' | 'travel_updated';
  title: string;
  body: string;
  data?: Record<string, any>;
}
```

### 3. 푸시 알림 서비스 구조
```
src/
├── modules/
│   └── push-notification/
│       ├── push-notification.module.ts
│       ├── push-notification.service.ts
│       ├── push-notification.controller.ts
│       ├── dto/
│       │   ├── register-token.dto.ts
│       │   └── notification.dto.ts
│       └── templates/
│           └── notification-templates.ts
├── services/
│   ├── fcm.service.ts          # Firebase Cloud Messaging
│   └── apns.service.ts         # Apple Push Notification Service
└── events/
    └── notification.events.ts   # 이벤트 기반 알림 트리거
```

## 🔧 주요 컴포넌트 설계

### 1. PushNotificationService
```typescript
@Injectable()
export class PushNotificationService {
  // 디바이스 토큰 등록/관리
  async registerDeviceToken(userId: string, token: string, platform: string)

  // 특정 사용자에게 푸시 발송
  async sendToUser(userId: string, notification: NotificationTemplate)

  // 여러 사용자에게 일괄 푸시 발송
  async sendToUsers(userIds: string[], notification: NotificationTemplate)

  // 여행 멤버들에게 푸시 발송
  async sendToTravelMembers(travelId: string, excludeUserId?: string)
}
```

### 2. FCMService & APNSService
```typescript
@Injectable()
export class FCMService {
  async sendNotification(tokens: string[], notification: NotificationTemplate)
  async sendToTopic(topic: string, notification: NotificationTemplate)
}

@Injectable()
export class APNSService {
  async sendNotification(tokens: string[], notification: NotificationTemplate)
}
```

### 3. 이벤트 기반 알림 트리거
```typescript
// 지출 관련 이벤트
@EventPattern('expense.created')
async handleExpenseCreated(data: { travelId: string, expense: TravelExpense, authorId: string })

@EventPattern('expense.updated')
async handleExpenseUpdated(data: { travelId: string, expense: TravelExpense, authorId: string })

@EventPattern('expense.deleted')
async handleExpenseDeleted(data: { travelId: string, expenseTitle: string, authorId: string })

// 여행 관련 이벤트
@EventPattern('travel.updated')
async handleTravelUpdated(data: { travelId: string, changes: any, authorId: string })
```

## 📱 알림 메시지 템플릿

### 지출 관련 알림
```typescript
const EXPENSE_TEMPLATES = {
  added: {
    title: '새 지출이 추가되었습니다',
    body: '{authorName}님이 "{expenseTitle}"을 추가했습니다 ({amount} {currency})',
    data: {
      type: 'expense_added',
      travelId: '{travelId}',
      expenseId: '{expenseId}'
    }
  },
  updated: {
    title: '지출이 수정되었습니다',
    body: '{authorName}님이 "{expenseTitle}"을 수정했습니다',
    data: {
      type: 'expense_updated',
      travelId: '{travelId}',
      expenseId: '{expenseId}'
    }
  },
  deleted: {
    title: '지출이 삭제되었습니다',
    body: '{authorName}님이 "{expenseTitle}"을 삭제했습니다',
    data: {
      type: 'expense_deleted',
      travelId: '{travelId}'
    }
  }
};
```

### 여행 관련 알림
```typescript
const TRAVEL_TEMPLATES = {
  updated: {
    title: '여행 정보가 수정되었습니다',
    body: '{authorName}님이 "{travelTitle}" 여행 정보를 수정했습니다',
    data: {
      type: 'travel_updated',
      travelId: '{travelId}'
    }
  }
};
```

## 🗄️ 데이터베이스 스키마

### device_tokens 테이블
```sql
CREATE TABLE device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  device_token VARCHAR(255) NOT NULL,
  platform VARCHAR(20) NOT NULL CHECK (platform IN ('ios', 'android')),
  is_active BOOLEAN DEFAULT true,
  last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(user_id, device_token)
);
```

### notification_logs 테이블 (선택적 - 알림 히스토리 추적)
```sql
CREATE TABLE notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  travel_id UUID REFERENCES travels(id),
  notification_type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  data JSONB,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status VARCHAR(20) DEFAULT 'sent' CHECK (status IN ('sent', 'failed'))
);
```

## 🔄 이벤트 발행 지점

### TravelExpenseService에서 이벤트 발행
```typescript
// 지출 생성 후
this.eventEmitter.emit('expense.created', {
  travelId,
  expense: result,
  authorId: userId
});

// 지출 수정 후
this.eventEmitter.emit('expense.updated', {
  travelId,
  expense: result,
  authorId: userId
});

// 지출 삭제 후
this.eventEmitter.emit('expense.deleted', {
  travelId,
  expenseTitle: expense.title,
  authorId: userId
});
```

### TravelService에서 이벤트 발행
```typescript
// 여행 수정 후
this.eventEmitter.emit('travel.updated', {
  travelId,
  changes: updateData,
  authorId: userId
});
```

## 🚀 API 수정 (기존 인증 API에 통합)

### 회원가입/로그인 시 토큰 등록
```typescript
// POST /api/v1/auth/signup
{
  "email": "user@example.com",
  "password": "password123",
  "name": "사용자명",
  "deviceToken": "fcm_or_apns_token",  // 🆕 추가
  "platform": "ios"                    // 🆕 추가
}

// POST /api/v1/auth/login
{
  "email": "user@example.com",
  "password": "password123",
  "deviceToken": "fcm_or_apns_token",  // 🆕 추가
  "platform": "android"               // 🆕 추가
}

// POST /api/v1/oauth/login (OAuth 로그인)
{
  "accessToken": "oauth_access_token",
  "loginType": "apple",
  "deviceToken": "apns_token",         // 🆕 추가
  "platform": "ios"                   // 🆕 추가
}

// POST /api/v1/oauth/signup (OAuth 회원가입)
{
  "accessToken": "oauth_access_token",
  "loginType": "google",
  "deviceToken": "fcm_token",          // 🆕 추가
  "platform": "android"               // 🆕 추가
}
```

### 알림 설정 관리 (선택적)
```typescript
// GET /api/v1/profile/notification-settings
async getNotificationSettings()

// PATCH /api/v1/profile/notification-settings
async updateNotificationSettings(@Body() { expenseNotifications: boolean, travelNotifications: boolean })
```

## 🔧 환경 변수 설정
```env
# Firebase Cloud Messaging
FCM_SERVER_KEY=your_fcm_server_key
FCM_PROJECT_ID=your_firebase_project_id

# Apple Push Notification Service
APNS_KEY_ID=your_apns_key_id
APNS_TEAM_ID=your_team_id
APNS_BUNDLE_ID=your.app.bundle.id
APNS_PRIVATE_KEY_PATH=path/to/apns/private/key

# 푸시 알림 설정
PUSH_NOTIFICATIONS_ENABLED=true
NOTIFICATION_RETRY_ATTEMPTS=3
NOTIFICATION_BATCH_SIZE=100
```

## 📊 알림 우선순위 및 배치 처리

### 우선순위 시스템
1. **High**: 지출 추가/수정/삭제 (즉시 발송)
2. **Medium**: 여행 정보 수정 (1분 내 발송)
3. **Low**: 기타 알림 (5분 내 배치 처리)

### 배치 처리 전략
- 같은 여행의 연속된 지출 변경사항은 1분간 묶어서 발송
- 토큰 만료/실패 시 자동 재시도 (최대 3회)
- 실패한 토큰은 비활성화 처리

## 🔐 보안 고려사항
- 디바이스 토큰 암호화 저장
- 사용자별 알림 설정 (ON/OFF)
- 여행 멤버가 아닌 경우 알림 차단
- Rate limiting 적용

## 📱 클라이언트 연동 가이드
```typescript
// iOS/Android에서 토큰 등록
POST /api/v1/notifications/tokens
{
  "deviceToken": "fcm_or_apns_token",
  "platform": "ios" | "android"
}

// 알림 수신 시 처리
{
  "type": "expense_added",
  "travelId": "uuid",
  "expenseId": "uuid"
}
```

## 🧪 테스트 시나리오
1. **지출 추가 시나리오**: 3명 여행에서 1명이 지출 추가 → 나머지 2명에게 알림
2. **지출 수정 시나리오**: 지출 작성자가 수정 → 다른 멤버들에게 알림
3. **지출 삭제 시나리오**: 지출 작성자가 삭제 → 다른 멤버들에게 알림
4. **여행 수정 시나리오**: 여행 소유자가 정보 수정 → 모든 멤버에게 알림
5. **토큰 만료 시나리오**: 만료된 토큰 처리 및 재시도