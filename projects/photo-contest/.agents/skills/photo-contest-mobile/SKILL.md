---
name: photo-contest-mobile
description: 피식 Expo WebView 셸의 탐색·네이티브 기능·dev client/빌드·테스트를 변경할 때 사용한다. 제품 화면과 폼은 피식 웹이 소유한다.
---

# 피식 모바일

앱 AGENTS.md와 루트 TypeScript 규칙을 따른다. 경로는 `apps/mobile` 기준이다. 앱 설정은 프로젝트 루트 .env만 읽고 별도 EXPO_PUBLIC 환경변수·App Link 인증·네이티브 로그인을 되살리지 않는다.

| 작업 | 참조 |
| --- | --- |
| 책임·구독·네이티브와 웹 경계 | [개요](references/overview.md) |
| WebView·URL 정책·뒤로 가기·복구 | [셸](references/webview-shell.md) |
| 공유·클립보드·진동 등 OS 기능 | [기능](references/native-capability.md) |
| dev client·환경·버전·번들·스토어 | [빌드](references/release.md) |
| unit/UI/API·native host·실기기 한계 | [테스트](references/mobile-test.md) |

메시지 계약 자체는 [피식 브리지](../photo-contest-bridge/SKILL.md), 관측은 [피식 모니터링](../photo-contest-monitoring/SKILL.md)을 읽는다. ts-pattern은 mobile·bridge에 추가하지 않는다.
