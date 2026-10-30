# Bambyul · 밤별

**직접 만들고 운영하며 배우는 사이드 프로젝트 모노레포.**

‘밤하늘의 별’에서 이름을 가져왔습니다. 기술 블로그, 게임 메이트 서비스, 사진 커뮤니티를 각각 독립된 제품으로 관리합니다.

[개발 가이드](docs/development.md) · [EC2 운영](deploy/shared-instance/README.md) · [블로그 배포](projects/blog/docs/deployment.md) · [공유 UI](packages/design-system/README.md)

## 프로젝트

| 서비스          | 무엇을 만드는가                                         | 코드·실행 안내                                    | 공개 주소                                          |
| --------------- | ------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------- |
| **밤별 블로그** | 한국어·영어로 기록하는 개발 경험, Git 기반 MDX          | [blog](projects/blog/README.md)                   | [blog.bambyul.com](https://blog.bambyul.com/ko)    |
| **Game Mate**   | 친추판매·코칭에서 시작한 게임 메이트, 게시판과 1:1 채팅 | [game-feedback](projects/game-feedback/README.md) | [game.bambyul.com](https://game.bambyul.com/ko)    |
| **별사대**      | 사진·영상·링크를 그룹에서 나누는 커뮤니티               | [photo-contest](projects/photo-contest/README.md) | [contest.bambyul.com](https://contest.bambyul.com) |

공개 주소는 서비스의 연결 대상입니다. 실제 배포 성공 여부는 각 배포 가이드와 Actions/Vercel 결과로 확인합니다. 모바일은 두 커뮤니티의 웹을 여는 Expo WebView 앱이며 스토어 배포와 웹 배포는 별개입니다.

## 빠른 시작

저장소 루트에서 **Node.js 24 · Yarn 4.17.0**을 사용합니다.

```sh
nvm use
npm install --global @yarnpkg/cli-dist@4.17.0 --force
yarn install --immutable

# DB 없이 시작할 수 있는 블로그
yarn workspace @blog/web dev
```

[블로그 로컬 화면](http://localhost:3100/ko)에서 확인합니다. 다른 서비스는 프로젝트별 환경 파일과 DB를 먼저 준비하세요. 업로드는 로컬·통합 테스트도 실제 AWS S3를 사용하며 가짜 S3 서버를 띄우지 않습니다.

| 프로젝트      | 웹              | API  | 개발 / 테스트 DB |
| ------------- | --------------- | ---- | ---------------- |
| blog          | 3100 (E2E 3101) | 없음 | 없음             |
| game-feedback | 3300            | 4300 | 55442 / 55444    |
| photo-contest | 3200            | 4200 | 55432 / 55434    |

다른 개발 서버·DB를 테스트에 재사용하지 않습니다. 환경변수·Prisma client·스토리지 경로는 프로젝트별로 분리합니다.

## 저장소 지도

```text
projects/
  blog/                 # Next.js · 다국어 MDX · Vercel
  game-feedback/        # Next.js · NestJS REST · Expo
  photo-contest/        # Next.js · NestJS GraphQL · Expo
packages/
  design-system/        # 공통 UI · 토큰 · Storybook
  config/               # ESLint · TypeScript · tsc7
  toolkit/              # 공유 푸시 전송 · migration/Sentry 검사
scripts/                # Git hook · worktree · 저장소 검사
deploy/shared-instance/ # 두 커뮤니티의 EC2 · 프록시 · DB · Terraform
```

프로젝트 내부의 앱은 `apps/*`, 해당 프로젝트만 공유하는 코드는 `packages/*`에 둡니다. 여러 제품이 실제로 공유할 필요가 있는 코드만 루트 `packages/*`로 올립니다. 구조·테스트 규칙은 [AGENTS.md](AGENTS.md)와 프로젝트별 지침을 따릅니다.

## 개발에서 운영까지

1. `origin/develop` 기준 기능 브랜치에서 작업하고 해당 앱의 검사를 실행합니다.
2. PR을 **merge commit**으로 `develop`에 반영합니다.
3. 검증한 변경을 `main`에 병합합니다. 운영 배포 기준은 `main`입니다.
4. 블로그는 Vercel Git 연동, 두 커뮤니티는 서비스별 GitHub Actions로 배포합니다. 앱 검사 통과와 배포 성공은 구분해 확인합니다.

**호스팅을 구분합니다.** 블로그는 Vercel이며 API·DB가 없습니다. 두 커뮤니티는 공통 EC2의 Caddy·PostgreSQL 18을 사용하고 DB role·네트워크를 분리합니다. 미디어는 비공개 S3의 서비스별 prefix, DB 백업은 별도 버킷을 사용합니다.

## 필요한 문서만 찾기

- [설치·포맷·hook·worktree·검사 규칙](docs/development.md)
- [Game Mate 실행과 개발](projects/game-feedback/README.md) · [별사대 실행과 개발](projects/photo-contest/README.md)
- [블로그 콘텐츠 작성](projects/blog/README.md#콘텐츠-작성) · [이관 기록](projects/blog/docs/migration.md)
- [EC2 배포·로그·롤백·복구](deploy/shared-instance/README.md) · [Terraform](deploy/shared-instance/terraform/README.md)

현재 사용법은 README와 배포 가이드를, 과거 의사결정·검증 결과는 각 프로젝트의 `docs/implementation.md`와 legacy 기록을 봅니다. 과거 기록은 현재 배포 절차를 대신하지 않습니다.
