# 덕담집

취업, 대입, 자녀의 결과를 기다리는 사람이 사주를 읽고 그날 해본 일을 한 줄 남기는 모바일 웹이다. 첫 회차 〈백 번째 지원서〉에서 친구와 자기소개서 첫 줄을 읽어주는 덕을 제안한다.

## 실행

```sh
yarn workspace @side/deokdam dev
```

로컬 주소는 http://127.0.0.1:3460 이다. 홈에서 취업 준비, 자녀 응원, 대입 준비를 고를 수 있다. 쇼츠의 카드 경로는 `/cards/<회차 슬러그>`, 기록은 `/journal`, 7일 상품은 `/shop`이다. 브라우저의 사이트 데이터에 덕 기록과 당일 풀이 캐시를 보관한다.

한국 음력은 `korean-lunar-calendar`로 양력에 대응시키고, 만세력은 `lunar-typescript`로 계산한다. 절기를 따지는 년주와 월주는 서울 현지 시각으로 비교한다. 출생 시각을 입력하지 않으면 시주를 미상으로 표시하고 절기 경계에 걸리는 년주나 월주도 미상으로 표시한다. 달력 입력은 한국 표준시(UTC+9)를 기준으로 해석한다. [한국천문연구원 월력 자료](https://astro.kasi.re.kr/kor/life/post/calendarData?year=2024)

## 서비스 연동

`apps/web/.env.example`에 환경변수 이름이 있다. 실제 키는 실행 환경의 비밀 저장소나 `.env.local`에서 제공한다.

| 기능             | 동작                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 개인 풀이        | `DEOKDAM_AI_MODEL`과 `DEOKDAM_AI_API_KEY`를 설정하면 OpenAI 호환 JSON 풀이를 요청한다. 로컬 모델은 `DEOKDAM_AI_LOCAL_PORT`로 지정한 루프백 서버를 사용한다. 기본 환경은 오행과 고민에 맞춘 기본 풀이를 보여준다. 생년월일과 출생 시각을 서버에 보내지 않는다.                                                                                                                              |
| 보상형 광고      | `DEOKDAM_REWARDED_AD_UNIT`에 Google Ad Manager의 웹 보상형 동영상 단위를 둔다. 본인 풀이에서 성인으로 계산된 이용자가 선택하면 광고 SDK를 로드한다. GPT의 보상 이벤트를 받으면 추가 풀이를 열고 해당 탭에서 풀이를 다시 볼 수 있다. 보상은 그 브라우저의 추가 콘텐츠 열람으로 제공한다. [Google 보상형 광고 예제](https://developers.google.com/publisher-tag/samples/display-rewarded-ad) |
| 7일 리포트       | 포트원 상점, 카드 채널, API 비밀키, 고객 문의 이메일, 공개 origin, 전용 SQLite 절대 경로를 설정해야 결제가 활성화된다. 카드 상품 한 편은 4,900원이다. 서버가 포트원에서 결제를 조회해 상점, 주문 번호, 금액과 통화가 맞고 승인된 경우 리포트를 발급한다. [포트원 인증 결제](https://developers.portone.io/opi/ko/integration/start/v2/checkout)                                            |
| 구매 복구와 환불 | 구매 내역에서 결제 완료와 취소 상태를 재확인할 수 있다. 환불 요청은 주문에 접수하며 담당자가 포트원 관리자에서 처리한다. 브라우저를 바꾼 이용자는 영수증 번호로 지원 이메일에 문의할 수 있다. 리포트 발급 상태를 담은 DB는 가맹점별 영구 볼륨에 둔다.                                                                                                                                      |
| Amplitude        | 덕담집 키가 설정된 경우에만 이벤트를 보낸다. 공개 회차, 이용 유형, 충분한 나이인지 여부, 상품 키를 기준으로 첫 풀이, 실제 기록, 광고 보상, 결제 확인, 리포트 발급을 관찰한다. 브라우저 클릭과 포트원 조회 후 서버 승인을 구분한다.                                                                                                                                                         |

로컬 AI 검증에는 MLX VLM의 텍스트 모델을 사용했다. 모델 서버의 주소를 이 Mac에만 열고 같은 모델 경로를 `DEOKDAM_AI_MODEL`에 지정한다. 예를 들어 아래처럼 모델 서버를 실행한 뒤 `DEOKDAM_AI_LOCAL_PORT=3462`로 웹을 실행한다.

```sh
python -m mlx_vlm.server --host 127.0.0.1 --port 3462 --model /absolute/path/to/text-model --max-tokens 220
```

## 사주 자료 검색

브라우저가 계산한 일간 오행과 선택한 고민으로 SQLite의 `sqlite-vec`에서 해석 자료를 찾는다. 선택한 오행의 고전 설명과 같은 고민에서 가장 가까운 실천 자료를 골라 AI에 전달한다. 과거 경험을 적으면 브라우저에서 일곱 가지 중 관련 주제를 골라 검색과 풀이에 반영한다. 화면에는 경험의 주제와 참고한 자료명을 보여준다. 전체 원국은 기기 화면에 표시하고 모델은 일간 오행 범위의 풀이를 작성한다.

[자료 원고](apps/web/src/features/reading/knowledge/corpus.ts)에는 오행 다섯 건과 일곱 가지 고민의 실천 자료 21건이 있다. 오행은 『서경』 「홍범」을 참고해 요약했고, 실천 자료는 덕담집에서 작성했다. [『서경』 「홍범」](https://ctext.org/shang-shu/great-plan/zh) · [한국민족문화대백과사전 사주](https://encykorea.aks.ac.kr/Article/E0025957)

AI 풀이를 처음 요청하면 자료, 이용 선택지 조합 35개, 경험 주제 7개의 벡터를 `apps/web/.data/reading-knowledge.sqlite`에 설치한다. 웹 프로세스에 쓰기 권한이 있는 전용 볼륨을 지정하려면 `DEOKDAM_READING_DB`에 SQLite 파일의 절대 경로를 둔다. 주문 DB와 분리하고 출생 정보와 경험 원문은 브라우저에 둔다. 임베딩은 `multilingual-e5-small`로 미리 계산한다. [모델 카드](https://huggingface.co/intfloat/multilingual-e5-small)

자료나 풀이 선택지를 편집한 뒤에만 임베딩 파일을 다시 만든다. PyTorch, Transformers와 Hugging Face Hub가 설치된 Python을 `PYTHON`에 지정한다. 첫 생성은 모델을 덕담집의 `.data/embedding-models`에 받는다. 완성한 스냅샷을 원고와 함께 저장하면 웹 실행 중에는 별도 임베딩 서버가 필요 없다.

```sh
yarn workspace @deokdam/web reading:embed
```

## 영상과 첫 출시

[덕담집 쇼츠 제작 스킬](.agents/skills/deokdam-shorts/SKILL.md)이 4개 회차의 카드, 움직이는 컷과 편집표를 연결한다. 채널 프로필에는 회차 이름과 `/cards/<회차 슬러그>?utm_source=youtube`가 붙은 공개 주소를 등록한다. 휴대폰에서 해당 카드가 열리는지 검수한다. 출시는 순서대로 〈백 번째 지원서〉, 〈엄마가 지운 카톡〉, 〈축하한다는 한 줄〉, 〈성적표가 뜨는 날〉을 쓴다. [쇼츠 링크 안내](https://support.google.com/youtube/answer/13748639?hl=ko)

[덕담집 사주극장](https://www.youtube.com/@deokdam-saju)의 [공개 쇼츠 재생목록](https://www.youtube.com/playlist?list=PLdR732KbVakE)을 홈에 연결했다. YouTube Studio에서 같은 목록에 쇼츠를 추가하면 웹 플레이어에도 나타난다. 다른 목록을 사용하려면 실행 환경의 `DEOKDAM_SHORTS_PLAYLIST_ID`를 지정한다. 개별 카드에 그 회차만 연결하려면 [회차 목록](apps/web/src/content/episodes.json)에 `youtubeVideoId`를 추가한다. 영상의 공개 범위와 삽입 허용 여부를 확인한다. 플레이어는 열기 버튼을 눌렀을 때 YouTube의 개인정보 보호 강화 주소를 불러온다. [YouTube 동영상·재생목록 삽입](https://support.google.com/youtube/answer/171780?hl=ko)

결제 채널 등록에는 상품 제목, 4,900원 가격, 첫날 샘플, 일곱 장의 제공 방식, 구매 복구·환불 절차를 제시한다. 포트원 심사와 카드 채널 연동을 확인한 뒤 상용 환경에 값을 등록한다. [포트원 사주·운세 업종 안내](https://help.portone.io/content/high-risk-industry)

초기 관찰 목표는 첫 무료 풀이를 본 성인 100명 중 20명이 7일 동안 서로 다른 3일에 기록하고, 성인으로 확인하고 결제 안내를 본 사람 100명 중 3명이 구매하는 것이다. 목표치는 검증 가설이다. 같은 참가자의 첫 노출일부터 7일 동안을 집계한다. 조회는 많은데 카드로 들어오는 수가 적으면 영상의 CTA를, 카드를 본 뒤 기록이 적으면 행동 문구를 점검한다.

## 운영 배포

피식이 실행 중인 공용 EC2에 Node 24 웹 컨테이너를 올리고, 별도 Docker 네트워크를 공용 Caddy에 연결한다. `Services`가 Linux amd64에서 단위·브라우저 테스트, 운영 이미지, SQLite 확장과 Caddy 설정을 확인한다. `main`에서 게시한 검증 이미지의 다이제스트로 운영 버전을 지정한다.

운영의 AI 풀이에는 서버 전용 API 키와 모델을 사용한다. SQLite의 참고 자료는 웹 프로세스가 조회한다. 운영 서버 설치와 업데이트, 도메인 연결과 복구 방법은 [덕담집 공용 EC2 배포](deploy/shared-instance/README.md)를 따른다.

## 검증

```sh
yarn workspace @side/deokdam check
yarn workspace @side/deokdam test:e2e
yarn workspace @side/deokdam build
```

E2E는 전용 포트에서 Chromium 모바일·데스크톱 화면을 연다. 공개 카드, 당일 기록 보존, 기본 풀이 복구, 가벼운 요청 본문, 광고 보상 이벤트 전후를 확인한다. 결제는 내부 주문 DB와 승인·취소 응답을 대조하는 테스트를 갖춘다.
