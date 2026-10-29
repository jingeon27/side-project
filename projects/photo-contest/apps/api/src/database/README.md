# 데이터 접근 경계

`GraphQL Resolver·REST Controller → Service → 도메인 Repository → Prisma` 순서다. Service는 입력·권한·업무 규칙과 응답 조립을 맡는다. Repository는 도메인별 projection·pagination·DB 조회·변경과 row/advisory lock을 맡으며 해당 feature module에 provider로 등록한다. 두 API는 Prisma client·Repository·UnitOfWork를 각각 소유한다.

범용 CRUD 기반 클래스나 모든 테이블을 노출하는 repository는 두지 않는다. 도메인 조회는 의미를 가진 메서드로 모으고, 선택적인 관계·필드가 필요한 경로는 `Prisma.SelectSubset`으로 결과 타입 추론을 유지한다. API 계약은 바꾸지 않는다.

여러 조회·변경을 묶을 때 Service에서 `UnitOfWork.run(async (client) => …)`을 사용한다. 내부의 모든 Repository와 권한·미디어 helper에 **같은 client를 전달**한다. client를 생략하면 평소의 연결 풀을 쓰므로 트랜잭션 중에 생략하지 않는다. 트랜잭션 밖으로 client를 저장하지 않는다. 배열형 run은 lazy PrismaPromise를 받아 전체를 커밋·롤백한다.

Photo Contest의 `UnitOfWork.atomic`은 기존 Serializable 재시도·unique 충돌 정책을 유지한다. 이벤트도 Repository를 통해 같은 트랜잭션에 기록한다. 파일 저장·삭제와 외부 fetch는 재시도되는 트랜잭션 밖에서 수행한다.

직렬화 충돌의 재시도는 50·100·200ms 간격을 두고 최대 4회 시도한다. 같은 시점에 사진 업로드 두 건을 완료할 때 상대 트랜잭션이 끝나기도 전에 재시도 한도를 모두 쓰지 않도록 한다. unique 충돌과 일반 오류에는 이 재시도를 적용하지 않는다.

## 소속 제약과 보관 정책

Post의 대회는 같은 groupId여야 한다. 업로드는 같은 groupId·authorId에 발급된 것만 붙인다. 추가 복합 FK는 migration SQL로 관리한다. 기존 단일 대회 FK의 SET NULL을 유지해 대회를 지워도 게시물의 groupId는 남는다. GroupMember.role은 OWNER·MODERATOR·MEMBER이고 그룹당 OWNER는 최대 한 명이다. 최소 한 명 유지는 그룹 생성·양도 트랜잭션이 맡는다. 대회 일정은 시작 < 제출 마감 < 종료, likeLimit은 1~100이다.

배포 전 아래 읽기 전용 점검 결과가 모두 0이어야 한다. migration은 불일치를 임의로 고치지 않으며 제약 검증에 실패하면 중단한다.

```sql
SELECT count(*) FROM "Post" p JOIN "Contest" c ON c.id = p."contestId" WHERE p."groupId" <> c."groupId";
SELECT count(*) FROM "Post" p JOIN "PostUpload" u ON u.id = p."uploadId" WHERE p."groupId" <> u."groupId" OR p."authorId" <> u."userId";
SELECT count(*) FROM "GroupMember" WHERE role NOT IN ('OWNER', 'MODERATOR', 'MEMBER');
SELECT count(*) FROM (SELECT "groupId" FROM "GroupMember" WHERE role = 'OWNER' GROUP BY "groupId" HAVING count(*) > 1) duplicates;
SELECT count(*) FROM "Contest" WHERE NOT ("startsAt" < "submissionEndsAt" AND "submissionEndsAt" < "endsAt") OR "likeLimit" NOT BETWEEN 1 AND 100;
```

기존 createContest mutation은 권한·입력 검사 후 FORBIDDEN을 돌려준다. 새 대회는 createGroupContest로 만든다. 기존 LEGACY 대회의 제출·투표·조회 계약은 유지한다. 테스트는 NODE_ENV=test에서 명시적으로 등록한 `/testing/legacy-contests`로 기존 데이터를 준비한다.

MaintenanceService.cleanup은 90일 지난 AnalyticsEvent를 한 번에 최대 1,000개씩 AnalyticsDailySummary로 옮긴다. UTC 날짜와 이벤트 종류별 eventCount만 남기며, 원본 userId·properties와 개별 이벤트 조회는 90일까지만 지원한다. 정리와 집계는 단일 SQL이므로 실패·재시도·동시 실행에도 건수를 중복 반영하지 않는다. 1분 주기 SchedulerService가 실행하며 중단 기간의 밀린 데이터는 다음 실행부터 배치 처리한다.

AnalyticsEventReceipt에는 event.id의 SHA-256 해시 키만 장기 보관한다. 원본 삭제 뒤 동일한 사실이 재요청되어도 다시 집계하지 않기 위해서다. 키 원문·userId·properties는 없지만 키의 수는 이벤트 수에 따라 늘어난다. 이는 원본 보관 정책과 별개인 중복 방지 비용이다. migration은 기존 키를 채우고 원본을 지우지 않는다. 새 writer가 적용된 뒤 유지보수 작업을 실행한다.

DB 전용 검증은 `yarn workspace @photo-contest/api test:database`로 실행한다. 실제 PostgreSQL의 격리 스키마에 모든 migration을 적용하고 정리한다. S3 전송·전체 HTTP 흐름은 기존 `test:integration`에서 함께 검사한다.
