# 부하테스트

API 앱의 `apps/api/scripts/public-read.k6.js`는 공개 그룹 목록 GraphQL을 호출한다. 세션·회원·게시물을 생성하지 않는다. `BASE_URL`은 `/graphql`을 붙이지 않은 API origin이고, `WEB_ORIGIN`은 API가 허용한 웹 origin이어야 한다.

## 실행

macOS에서는 [공식 설치 안내](https://grafana.com/docs/k6/latest/set-up/install-k6/)에 따라 `brew install k6`로 설치한다. 저장소 루트에서 다음을 실행한다.

```sh
k6 run -e BASE_URL=http://127.0.0.1:4200 -e WEB_ORIGIN=http://localhost:3200 \
  -e RATE=1 -e DURATION=30s projects/photo-contest/apps/api/scripts/public-read.k6.js
```

`RATE`는 초당 요청 수다. 1 → 3 → 5 RPS를 전용 서버에서 확인하고, 예상 피크를 정한 뒤 별도 스테이징 production 빌드에서 지속 시간을 늘린다. API origin을 사용하면 API·DB를, 웹 origin에 `/backend`를 붙인 `BASE_URL`을 사용하면 Next GraphQL 프록시까지 측정한다. 운영 공개 캐시·SSR·실제 브라우저 렌더링은 각각 별도 시나리오로 본다.

## 기준과 제한

- p95 500ms, p99 1000ms 미만은 예제 기준이다. 서비스 목표에 맞게 바꾼다.
- HTTP 실패율 1% 미만, `checks` 99% 초과, `rate_limited` 0, `dropped_iterations` 0을 확인한다.
- GraphQL은 HTTP 200이어도 `errors`가 있으면 실패다. 예제는 `data.discoverGroups`의 실제 배열까지 검사한다.
- 운영 GraphQL은 주소당 분당 600회 제한이다. 단일 IP에서 10 RPS를 오래 넘기면 429가 나올 수 있다. Origin·쿠키를 바꿔도 주소별 한도는 바뀌지 않는다.
- 익명 세션 발급·비밀번호 로그인은 반복마다 호출하지 않는다. 개인화 피드·댓글·좋아요·글쓰기는 setup에서 만든 VU별 독립 세션과 전용 그룹을 사용한다. 쓰기에는 사용자·주소별 별도 한도가 있으므로 측정 대상과 분리한다.
- 업로드는 S3 직접 전송과 API의 발급·HEAD 확인·완료·게시를 나눠 본다. 실제 운영 버킷·대회 데이터로 테스트 fixture를 만들지 않는다.

[k6 threshold](https://grafana.com/docs/k6/latest/using-k6/thresholds/)를 넘으면 실패 코드로 끝난다. 같은 시간대 EC2 CPU·메모리, RDS 연결 수·지연·잠금, API·웹 로그를 함께 기록한다. 부하 생성기가 서버와 CPU를 공유하면 결과가 왜곡되므로 최종 측정은 다른 머신에서 실행한다. 현재 Sentry만으로 성능 병목을 판단할 수는 없다.

대규모 부하테스트는 이 작업에서 실행하지 않았다. 이 예제는 공개 그룹 조회의 시작점이며 전체 서비스 수용량을 보장하지 않는다.
