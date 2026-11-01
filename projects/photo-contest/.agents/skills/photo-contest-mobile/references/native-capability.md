# native-capability

메시지 계약(`packages/bridge`의 `WEB_REQUEST`·`PROTOCOL_VERSION`)과 웹 대체 동작은 [bridge](../../photo-contest-bridge/SKILL.md) 스킬이 기준이다. 앱 작업 안에서 `packages/bridge`를 고치지 않는다 — 계약이 부족하면 보고하고, 바꿀 때는 [bridge](../../photo-contest-bridge/SKILL.md) 스킬 순서로 따로 커밋한다.

## 두 층 (`src/features/bridge`)

- `lib/create-capabilities.ts`의 `createCapabilities(deps)`: 판단만 한다. 플랫폼 동작은 전부 `ICapabilityDependencies`로 받는다. react-native·expo는 `import type`만 쓴다 — `e2e/support/native-host.ts`가 이 파일을 Node(Playwright)에서 그대로 돌린다.
- `model/native-capabilities.ts`: `createNativeDependencies()`가 RN `Share`·expo-clipboard·expo-haptics·expo-web-browser를 잇고 `createNativeCapabilities()`가 묶는다. 값 매핑(`IMPACT_STYLE`·`NOTIFICATION_TYPE`)과 색 옵션만 두고 판단은 넣지 않는다.
- `useWebShell`이 화면당 한 번(`useState`) 만든다. 진행 중 플래그가 이 인스턴스에 있으므로 렌더마다 새로 만들지 않는다.

## 웹에 알리는 기능 목록

- 앱 정보의 `capabilities`는 `Object.keys(capabilities)`다(`src/_pages/web-shell/model/use-web-shell.ts`의 `buildBootstrapScript`). 웹은 목록에 있을 때만 요청하고(`bridge.supports`) 없으면 웹 기능으로 대신한다. 다 되지 않은 기능은 키를 넣지 않는다.
- 반환 타입이 `Required<TNativeCapabilities>`라 브리지에 요청이 생기면 typecheck가 구현을 요구한다. 한 플랫폼에서만 되는 기능은 그 플랫폼에서 키를 빼고(그때 반환 타입을 푼다) 웹 대체에 맡긴다.
- `src/_pages/web-shell/@page/WebShellPageTemplate.spec.tsx`가 목록을 순서까지 단언한다. 기능을 더하면 그 기대값도 고친다.

## 결과·오류·대기 시간

- 라우터가 결과를 `WEB_REQUEST[type].result`로 다시 검증하고, 틀리면 웹은 `FAILED`('앱 응답을 만들지 못했습니다.')만 받는다. 스키마부터 본다: `clipboard.copy`는 `copied: true`만 받으므로 실패를 결과로 돌려주지 않고 던진다.
- 던지는 코드는 둘뿐이다. 사용자가 닫거나 취소 → `new NativeCapabilityError(BRIDGE_ERROR_CODE.Cancelled, '…')`(웹은 조용히), 그 밖 → `BRIDGE_ERROR_CODE.Failed`(웹이 토스트). 메시지는 짧은 사용자용 한국어로 쓰고 원래 오류 문구·URL·코드를 싣지 않는다. 그냥 던진 오류는 라우터가 일반 `FAILED`로 바꾸고, `UNSUPPORTED`·`INVALID`·`TIMEOUT`은 라우터·웹이 만든다.
- 웹 대기 시간(`packages/bridge/src/web.ts`의 `DEFAULT_TIMEOUT_MS`)을 넘길 수 있는 API는 먼저 답한다. `link.open`은 `openBrowserAsync`(iOS는 닫혀야 끝난다)와 `LINK_OPEN_SETTLE_MS`(300ms)를 경주시키고, 진 쪽 실패도 값으로 받아 처리되지 않은 거부를 남기지 않는다.
- 겹치면 안 되는 동작은 진행 중 플래그로 두 번째 요청을 `CANCELLED`로 답하고 `finally`에서 푼다. 플랫폼 차이는 `deps.platform`으로 나눈다(공유: iOS는 `url`, Android는 `message`에 문구+URL).

## 체크리스트

1. 새 expo 모듈은 [release](release.md) 문서로 버전을 확인하고 `chore(deps)` 커밋을 먼저 만든다.
2. `ICapabilityDependencies`에 더한 의존성을 `createNativeDependencies()`, `create-capabilities.spec.ts`의 `createFakeDependencies()`, `e2e/support/native-host.ts`(기록용 가짜·`IPlatformCalls`) 세 곳에 채운다.
3. unit(`create-capabilities.spec.ts`): 성공·취소·실패·형식 오류와 `createNativeRouter`를 거친 응답 JSON. ui: 새 네이티브 모듈을 `vitest.setup.ts`에서 `vi.mock`. e2e: 웹 버튼 → `nativeHost.calls`·`nativeHost.platform`.
4. dev client 실기기에서 실제 시트·브라우저·앱 복귀를 확인한다(Expo Go로는 안 된다).
