# 데이터 접근 경계

`GraphQL Resolver·REST Controller → Service → 도메인 Repository → Prisma` 순서다. Service는 입력·권한·업무 규칙과 응답 조립을 맡는다. Repository는 도메인별 projection·pagination·DB 조회·변경과 row/advisory lock을 맡으며 해당 feature module에 provider로 등록한다. 두 API는 Prisma client·Repository·UnitOfWork를 각각 소유한다.

범용 CRUD 기반 클래스나 모든 테이블을 노출하는 repository는 두지 않는다. 도메인 조회는 의미를 가진 메서드로 모으고, 선택적인 관계·필드가 필요한 경로는 `Prisma.SelectSubset`으로 결과 타입 추론을 유지한다. API 계약은 바꾸지 않는다.

여러 조회·변경을 묶을 때 Service에서 `UnitOfWork.run(async (client) => …)`을 사용한다. 내부의 모든 Repository와 권한·미디어 helper에 **같은 client를 전달**한다. client를 생략하면 평소의 연결 풀을 쓰므로 트랜잭션 중에 생략하지 않는다. 트랜잭션 밖으로 client를 저장하지 않는다. 배열형 run은 lazy PrismaPromise를 받아 전체를 커밋·롤백한다.

Photo Contest의 `UnitOfWork.atomic`은 기존 Serializable 재시도·unique 충돌 정책을 유지한다. 이벤트도 Repository를 통해 같은 트랜잭션에 기록한다. 파일 저장·삭제와 외부 fetch는 재시도되는 트랜잭션 밖에서 수행한다.
