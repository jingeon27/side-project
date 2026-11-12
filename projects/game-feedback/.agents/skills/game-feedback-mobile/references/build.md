# 모바일 실행과 빌드

경로는 apps/mobile 기준이다. 앱 설정의 원본은 app.config.ts와 src/shared/config/env.ts이며 프로젝트 루트 .env를 읽는다. app.config.ts가 새 루트 키를 읽으면 프로젝트 .env.example에도 더한다(app.config.test.ts가 확인한다).

## 환경과 실행

- ENVIRONMENT가 development/test이면 개발 설정, 그 밖은 production이다. WEB_ORIGIN은 개발에서만 http://localhost:3300을 기본값으로 쓰며 production은 HTTPS origin이 필수다. 경로·인증정보·query·hash는 거부한다.
- 공개 NEXT_PUBLIC_SENTRY_DSN·NEXT_PUBLIC_AMPLITUDE_API_KEY는 app.config.ts가 Expo extra에 넣는다. 서버 자격 증명·세션·쿠키는 넣지 않는다. 별도 모바일 .env·EXPO_PUBLIC 키·APP_VARIANT·MOBILE_* App Link 설정은 사용하지 않는다.
- 선택 빌드 키 MOBILE_EAS_PROJECT_ID(푸시)는 app.config.ts가 UUID v4로 검사해 extra.eas.projectId로 넘긴다. 비우면 앱 푸시를 끄고(웹에 알림 기능을 알리지 않는다), 형식이 틀리면 빌드를 멈춘다. 검사는 app.config.spec.ts가 고정한다. projectId만 있고 apps/mobile/google-services.json(Git 제외)이 빠진 Android 빌드는 웹에 알림 켜기가 보이지만 토큰 발급이 실패하므로, 두 값이 함께 들어갔는지 확인하고 두 플랫폼 실기기에서 알림 켜기를 확인한 뒤 API의 PUSH_NOTIFICATIONS_ENABLED를 켠다.
- EAS 원격 빌드에는 Git에서 제외한 루트 .env가 올라가지 않는다. 프로젝트 .env.example에 적은 대로 운영 WEB_ORIGIN, 공개 관측 키, MOBILE_EAS_PROJECT_ID를 EAS 환경변수로 넣는다. WEB_ORIGIN이 빠지면 production 빌드가 멈추고, MOBILE_EAS_PROJECT_ID가 빠지면 앱 푸시가 꺼진다.
- src/shared/config/env.ts는 Constants.expoConfig.extra에서 origin을 읽고 __DEV__가 아닌 JS에서는 HTTP를 거부한다. 설정/공개 값 변경은 바이너리 재빌드가 필요하다.
- Expo Go 대신 dev client를 쓴다. 개발 Web/API는 3300/4300, Metro는 8082이며 Android는 adb reverse tcp:3300 tcp:3300으로 같은 localhost origin을 유지한다. 기존 서버를 종료하거나 다른 origin을 임의로 주입하지 않는다.

```sh
ENVIRONMENT=development yarn workspace @game-feedback/mobile android
ENVIRONMENT=development yarn workspace @game-feedback/mobile start
yarn workspace @game-feedback/mobile typecheck
yarn workspace @game-feedback/mobile lint
yarn workspace @game-feedback/mobile test src/shared/config
yarn workspace @game-feedback/mobile bundle:check
```

## 네이티브 설정

- app.config.ts의 scheme·앱 식별자·버전·권한 설명·plugins를 기준으로 한다. 현재 식별자는 dev.side.gamefeedback, iOS 최소 버전은 17.4, 테마는 automatic이며 App Link/Universal Link 배포 설정은 없다.
- src/shared/config/env.ts의 APP_VERSION과 app.config.ts의 version은 함께 확인한다. 스토어의 bundle ID·package·buildNumber·versionCode·서명 설정은 실제 제출 요청에서 확인하며 일반 코드 변경에 섞지 않는다.
- 네이티브 설정·모듈 변경은 dev client 재빌드가 필요하다. 기존 생성 android/ios 폴더의 변경 여부를 먼저 확인하고 사용자 변경을 지우지 않는다.
- Expo 권장 네이티브 버전은 설치된 bundledNativeModules.json, React/React DOM은 루트 catalog·React Native peer 범위를 확인한다. 버전 변경 시 typecheck·테스트와 Android/iOS export를 모두 검증한다.
- bundle:check는 두 플랫폼을 .expo-export-check에 export하고 정리한다. Metro export는 JS를 실행하지 않으므로 실제 설정·로그인·기기 동작·서명된 스토어 빌드 검증과 구분한다.
