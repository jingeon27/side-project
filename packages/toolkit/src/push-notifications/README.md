# Native activity push

Game Feedback와 Photo Contest가 같은 Expo HTTP 전송·티켓·영수증 경계를 공유한다. Nest 인증·Prisma·알림 권한은 각 서비스 안에 있고, 기기·사용자·DB·Expo 프로젝트도 서로 분리한다.

- 웹은 네이티브 브리지로 설치 UUID·Expo push token·OS 권한만 받고, HttpOnly 쿠키로 현재 세션에 기기를 등록한다. 네이티브에 로그인 쿠키나 API 토큰을 넘기지 않는다. OS 권한은 알림함의 **알림 켜기**에서만 요청한다.
- 서버는 새 알림과 같은 트랜잭션에 기기별 큐를 기록한다. 기기 등록 이전의 과거 알림은 푸시하지 않는다. 로그아웃·세션 교체·계정 삭제는 세션 FK의 cascade로 기기와 대기 큐를 지운다. 기기 계정 전환도 이전 전송을 지운다.
- 15초 주기로 최대 100개를 DB 임대로 가져오고 전송 직전에 세션 만료·계정 상태·읽음·차단·그룹 및 관리 권한을 다시 확인한다. 잠금화면에는 본문·닉네임·비공개 그룹 이름 없이 일반 안내와 알림함 경로만 보낸다.
- HTTP 429/5xx·네트워크 오류와 기기별 MessageRateExceeded만 최대 6회 재시도한다. DeviceNotRegistered는 기기를 비활성화한다. 티켓은 전달 성공으로 취급하지 않고 15분 후 영수증을 확인한다. 없는 영수증은 다시 조회하며 24시간이 지난 작업은 종료한다. 큐는 2일 후 정리한다.
- API 종료·네트워크 단절이 Expo 수락과 DB 기록 사이에 일어나면 재전송될 수 있다. 제공자가 정확히 한 번 전달을 보장한다고 가정하지 않는다. 앱은 같은 OS 응답의 중복 탭을 제거하고 문서 준비 후 알림함만 연다.

## 실제 앱에 필요한 설정

1. 각 앱을 서로 다른 Expo/EAS 프로젝트에 연결하고, 해당 UUID를 앱 빌드 환경의 `EXPO_PUBLIC_EAS_PROJECT_ID`에 넣는다. 웹/API에 노출하는 비밀키가 아니다.
2. Android는 해당 application ID의 Firebase 앱 `google-services.json`을 EAS file 환경변수로 제공하고 그 파일 경로를 `MOBILE_GOOGLE_SERVICES_JSON`으로 받는다. 별도의 FCM v1 서비스 계정 비공개 JSON은 EAS의 push credentials에 등록한다(앱 설정 파일과 다른 자격 증명이다). iOS는 해당 bundle ID의 APNs push key/권한을 EAS에 연결한다. 자격 증명 JSON·APNs key는 저장소에 넣지 않는다.
3. `expo-notifications` 플러그인이 추가됐으므로 dev client 또는 스토어 바이너리를 새로 빌드한다. Expo Go와 시뮬레이터 검증을 실제 원격 푸시 수신으로 대신하지 않는다.
4. 각 API에 migration을 적용하고 `PUSH_NOTIFICATIONS_ENABLED=true`를 설정한다. Expo 대시보드에서 enhanced push security를 활성화했다면 해당 서비스의 서버 전용 `EXPO_ACCESS_TOKEN`도 설정한다. 앱 번들·웹 공개 환경변수에 넣지 않는다. 운영 Compose에 두 값이 전달된다.
   AWS에는 SNS/Pinpoint 권한을 추가하지 않는다. API의 기존 외부 HTTPS 통신으로 Expo에 요청하며 Terraform은 FCM/APNs 자격 증명을 만들지 않는다.

5. 실기기 로그인 → 알림함에서 켜기 → 다른 계정으로 댓글/답글/채팅/가입 신청/대회 이벤트 생성 → foreground 갱신·background 알림·종료 상태 탭 → 읽음 배지 → 로그아웃 후 미수신을 확인한다. 실제 자격 증명과 실기기가 없는 환경에서는 이 검증을 완료로 기록하지 않는다.

Game Feedback는 팔로우 새 글·답변/댓글/대댓글·채팅, Photo Contest는 내 글 댓글·내 댓글 답글·대회 시작/종료·가입 승인/거절·관리자 가입 신청 알림을 보낸다. Photo Contest에 개인 팔로우/1:1 채팅을 추가하지 않는다.

검사: `yarn workspace @side/toolkit check` 및 각 API의 격리 DB 통합 테스트·bridge/mobile/web 테스트. 공통 패키지의 빌드는 각 API 명령과 Docker 빌드에서 먼저 실행하고 런타임 이미지에도 포함한다.

제공자 문서: [Expo setup](https://docs.expo.dev/push-notifications/push-notifications-setup/), [티켓·영수증](https://docs.expo.dev/push-notifications/sending-notifications/), [OS API](https://docs.expo.dev/versions/latest/sdk/notifications/).
