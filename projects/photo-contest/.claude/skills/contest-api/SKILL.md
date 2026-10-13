---
name: contest-api
description: 그룹 권한, 공모전 마감, 사진 제출·열람, 투표·신고와 OAuth API를 구현하거나 검토할 때 사용한다.
---

그룹 멤버십은 목록·상세·사진 파일 열람에도 적용한다. ID를 안다고 접근할 수 없어야 한다.
투표 1회와 사진 1개는 UI disabled가 아닌 DB unique 제약으로 보장한다.
마감은 서버 시계, phase는 저장하지 않고 deadline으로 계산한다. 득표수는 종료 전 노출하지 않는다.
자기 사진 투표 금지, 숨긴 사진 투표 금지, 공동 우승 허용. 관리자만 숨길 수 있다.

OAuth는 카카오와 구글. state·PKCE를 검증하고 session 원문은 DB에 저장하지 않는다.
서로 다른 provider의 이메일만으로 계정을 합치지 않는다.
dev 로그인은 명시적 flag와 development 환경에서만 연다. 운영 환경에서는 fail-closed.
사진은 private 저장소에 보관하고 업로드 시 실제 포맷·픽셀 크기를 검사해 메타데이터 없이 변환한다.
