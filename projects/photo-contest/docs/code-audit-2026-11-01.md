# 피식 변경 코드 감사 — 2026-11-01

**20/20. 검토한 변경 범위의 미해결 actionable finding은 없다.** UI 기술 Audit 18→20과 다른 루브릭이며 코드 감사에는 별도의 전후 점수를 만들지 않았다. 비교 기준은 `9576836125cfd91e977b417b50dd9b049e649cff`, 검토한 제품·테스트 커밋은 `22b7d580`이다. 다른 모노레포 프로젝트는 평가하지 않았다.

각 항목0–4: 4는 관측한 범위의 요구와 검사를 만족함, 3은 작은 미해결 보완점, 2는 유의미한 공백, 1은 큰 결함, 0은 기능을 막는 상태다. 20점이 전체 서비스의 무결함이나 보안 인증을 뜻하지 않는다.

| 항목           |      점수 | 변경 코드의 근거                                                                                                                                                                                                                                                                                                                   |
| -------------- | --------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 기능 정확성    |       4/4 | ComposeEntryButton/BottomSheet가0·1·여러 그룹의 즉시 이동·선택을 구분한다. 그룹 상세는 native 작성 링크로 현재 그룹에 직행하며, 빈 카테고리 복구는 소유 URL 키만 지운다. 공개 가입·비공개 승인 후 같은 화면의 작성 진입을 실제 API/E2E로 확인했다.                                                                                 |
| 보안·권한      |       4/4 | GroupPageTemplate의 canViewPosts와role 경계를 유지하며 private pending에는 feed/작성 링크가 없다. GroupIdentity 초대 진입과 InviteCard 재생성 조건을 유지했다. React 텍스트와 내부 ROUTES를 사용하며 새 인증·업로드·DB·API 경로는 추가하지 않았다. **변경된 UI와 기존 API 경계의 회귀 확인이며 전체 API 인증·침투 시험은 아니다.** |
| 구조·상태 관리 |       4/4 | Apollo QueryRef/정규화 캐시와 URL 필터가 기존 소유권을 유지한다. 공통 FAB는3화면에서 공유하며 스크롤 listener/idle timer를 한 곳에서 정리한다. 초대 shortcut은 기존 단일 native details의 ref/focus/scroll을 사용하고 서버 상태나 UI를 복제하지 않는다.                                                                            |
| 테스트         |       4/4 | 같은 v2 production build에서 관련13개 시나리오×3engine, 최종39/39 통과. 실제 API·격리 DB·앱 소유 E2E를 사용했다. 키보드 준비 상태와180ms transient 관찰 경합을 trace 근거로 보강한 뒤 선별 검사와 최종 전체 실행으로 확인했다.                                                                                                     |
| 유지보수       |       4/4 | 페이지 전용 빈 상태/조회는 해당 페이지, 공통 작성 진입은 widget에 둔다. 범용 모드·중복 권한·새 상태 관리 도구를 추가하지 않았다. 관련 AGENTS/스타일링/구현 문서와 회귀 검사를 함께 갱신했다.                                                                                                                                       |
| **총점**       | **20/20** | **관측한 현재 PI 변경 범위**                                                                                                                                                                                                                                                                                                       |

## 확인한 증거

- B 직접 실행: final `e2e-final39-stable.log` **39 passed (57.8s)**. Chromium mobile·WebKit mobile·Chromium desktop, 동일 제품 v2, 실행 namespace `b5-final9`. 이전 실행 횟수를39개 고유 시나리오에 더해 세지 않는다.
- B 직접 실행: WebKit 준비/관찰 보강 각각1개 선별 통과, 마지막 test 수정 후 web typecheck·해당 ESLint·Prettier·diff 검사 통과.
- Root 실행 결과 전달: 전체 unit154파일647개 통과. 이후 v2 관련2파일12개 재검증 통과(전체에 더하는 고유 테스트 수가 아님). type/lint/knip 통과.
- 관련 UI 관측: 같은32개 기본 글꼴·12개 실제 사용자200% 글꼴 행렬에서 overflow/pageerror0, owner expanded200%에서도 overflow0. 세부 근거와 한계는 별도 `audit.md`에 둔다.
- 별도 read-only preflight의 Activity/toast 가설은 실제 SPA 이동에서 재현되지 않아 finding/감점으로 세지 않았다.

## 실패 기록과 해결을 구분

처음 통합 실행38/39에서는 WebKit이 hydration-disabled 버튼에 먼저 Enter를 보냈다. `toBeEnabled`를 기다리도록 수정하고 동일 실제 keyboard/open/focus 단언을 유지했다. 다음36/39는 같은 리뷰 스키마를 재사용해 이전 고정 검색 fixture가 중복된 결과였다. 일반 앱 실행기는 매번 새 UUID schema를 만들지만 리뷰는 동일 fixture를 유지하므로, 리뷰 runner의 실행별 project-name suffix로 검색 fixture를 분리했다. 데이터 reset·행 삭제·assert 약화는 하지 않았다. 이후38/39에서는 WebKit의180ms compact 구간 관찰이 흔들려, 실제 새 scroll0/idle를 확인하고 scroll 전에 readonly MutationObserver를 등록했다. 실제 scroll>0, compact=true 관측, 이후 원상복귀를 모두 유지해 검증했다.

이 실패 로그와 선별 재검증·trace 근거는 그대로 보존했다. 최종 성공은 마지막39/39 실행과 구분해 기록한다. 제품 duration·권한 guard·DOM 상태를 테스트를 위해 바꾸지 않았다.

## 범위의 한계

제품/테스트 변경과 연결된 공개·익명·private pending/approved 동작을 검사했다. 실기기·실제 스크린 리더·전체 API 보안·CPU/프레임 성능을 인증하는 감사는 아니다. 최종 제품 소스는 v2 빌드 후 바뀌지 않았고 그 뒤의 변경은 테스트 준비/관찰 보강과 문서다. source-manifest/provenance와 실패 원본을 `.data`에 보존한다.

디자인의 남은 P3 관찰 두 건은 [그룹 상세 평가](group-detail-review-2026-11-01.md)에 별도로 기록했다. 이 코드 점수는 그 관찰을 시각적으로 완전 해결했다는 의미가 아니다.
