# 모바일 실행과 릴리스

경로는 apps/mobile 기준이다. 앱 설정은 app.config.ts와 src/shared/config/env.ts, 프로젝트 루트 .env가 소유한다.

## 환경과 실행

- NODE_ENV가 development/test이면 개발 설정이다. WEB_ORIGIN은 개발에서만 http://localhost:3200을 기본값으로 쓰고 production에서는 HTTPS origin이 필수다. 경로·인증정보·query·hash는 거부한다.
- 공개 NEXT_PUBLIC_SENTRY_DSN·NEXT_PUBLIC_AMPLITUDE_API_KEY와 선택 빌드 키 MOBILE_EAS_PROJECT_ID(푸시)·MOBILE_IOS_APP_STORE_ID(iOS 업데이트 화면의 스토어 버튼)를 Expo extra로 전달한다. 빌드 키는 비우면 그 기능을 끄고, 형식이 틀리면 app.config.ts가 빌드를 멈춘다. EAS 원격 빌드에는 Git에서 제외한 로컬 .env가 올라가지 않으므로 운영 WEB_ORIGIN과 공개 관측 키 두 개, 쓰는 빌드 키를 EAS 환경변수로 넣는다. 관측 키가 빠지면 빌드는 통과하지만 운영 앱의 오류 수집과 분석이 꺼진다. 별도 모바일 .env·EXPO_PUBLIC 키·APP_VARIANT·App Link 인증 설정은 만들지 않는다. 서버 자격 증명은 앱에 넣지 않는다.
- WebView 세션은 HttpOnly 쿠키이고 앱은 WEB_ORIGIN의 /backend만 사용한다. JS origin 검증은 Constants.expoConfig.extra와 __DEV__를 사용하므로 설정 검사와 번들 export를 구분한다.
- Expo Go가 아니라 dev client를 쓴다. 기존 Web/API 3200/4200을 유지하고 Android는 adb reverse tcp:3200 tcp:3200으로 같은 origin을 쓴다. iOS 실기기는 기기에서 닿는 origin과 API의 Origin 정책이 일치해야 한다.

```sh
NODE_ENV=development yarn workspace @photo-contest/mobile android
NODE_ENV=development yarn workspace @photo-contest/mobile start
yarn workspace @photo-contest/mobile typecheck
yarn workspace @photo-contest/mobile lint
yarn workspace @photo-contest/mobile bundle:check
```

## 버전과 제출

- app.config.ts의 앱 식별자·scheme·version과 실제 스토어 등록·서명·buildNumber/versionCode를 제출 전에 대조한다. 네이티브 설정·모듈 변경 후에는 dev client를 다시 빌드하며 기존 생성 폴더에 사용자 변경이 있으면 보존한다.
- 강제 업데이트는 GET /backend/app/config의 최소 버전으로 판단한다. 이 값은 API 앱 src/config/env.ts의 appVersions() 코드 상수(지금은 최소·최신 모두 1.0.0)이고 환경변수로 바꿀 수 없으므로, 올리려면 이 코드를 바꿔 API를 배포한다. 두 스토어에서 새 버전을 받을 수 있는 것을 확인하기 전에는 minimum을 올리지 않는다. iOS는 MOBILE_IOS_APP_STORE_ID를 넣은 빌드가 배포됐고 업데이트 화면 버튼이 `https://apps.apple.com/app/id<ID>`를 여는지도 먼저 확인한다. 이 ID가 없는 빌드는 버튼을 숨긴다.
- 푸시를 켜기 전에 Android 빌드에 MOBILE_EAS_PROJECT_ID와 apps/mobile/google-services.json(Git 제외)이 함께 들어갔는지 확인한다. projectId만 있으면 웹에 알림 켜기가 보이지만 토큰 발급이 실패해 알림 설정 실패 문구가 나온다. 두 플랫폼 실기기에서 알림 켜기를 확인한 뒤 API의 PUSH_NOTIFICATIONS_ENABLED를 켠다. 자격 증명 준비는 [푸시 공통 패키지](../../../../../../packages/toolkit/src/push-notifications/README.md)를 따른다.
- 앱은 별도 시스템 브라우저 소셜 로그인·App Link 인증을 제공하지 않는다. 제거된 환경변수나 인증서 배포 절차를 다시 도입하지 않는다.
- Expo 네이티브 의존성은 설치된 권장 버전, React/React DOM은 루트 catalog와 React Native peer 범위를 확인한다. 변경하면 manifest·lockfile과 두 플랫폼 export를 검증한다.
- Sentry·Amplitude 키가 없으면 수집하지 않는다. source-map 업로드용 인증값을 앱 번들에 넣지 않으며 [모니터링](../../photo-contest-monitoring/SKILL.md)을 따른다.
- bundle:check·Playwright는 서명된 스토어 빌드·dev client 실기기 확인을 대신하지 않는다. 키보드·카메라/앨범·공유·뒤로 가기는 실기기 검증 여부를 별도로 보고한다.
