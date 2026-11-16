# Qwen 오픈소스 활용 계획

**첫 조합은 Ollama + Qwen3.8 27B 4bit + SillyTavern으로 정한다.** M5 Pro·통합 메모리 48GB에서 한국어 캐릭터 대화와 소설 초안을 먼저 완성하고, 영상은 ComfyUI와 Kdenlive를 이어 쓴다. 직접 만들 부분은 카카오 대화 파일을 검토 가능한 캐릭터 카드로 변환하는 작은 로컬 도구다. 기존 채팅 화면·대화 저장·세계관 관리·영상 편집기를 재사용하며, 처음부터 웹·API·DB 플랫폼 전체를 구축하지 않는다.

캐릭터 설명·첫 인사·예시 대화·요약·실제 응답을 한국어로 작성한다. SillyTavern에는 한국어 UI 번역이 있지만 모델의 한국어 품질은 별도로 시험한다. [한국어 번역 파일](https://github.com/SillyTavern/SillyTavern/blob/release/public/locales/ko-kr.json)

**1. 도구별 역할과 처음 연결할 조합**

| 역할             | 사용할 도구        | 활용할 기능                                |
| ---------------- | ------------------ | ------------------------------------------ |
| 모델 실행·관리   | Ollama             | 로컬 Qwen 실행과 API 제공                  |
| 대화·소설 초안   | SillyTavern        | 캐릭터 카드, 대화 기록, 세계관, 요약       |
| 영상 생성        | ComfyUI            | 공식 모델 워크플로와 생성 대기열           |
| 영상 편집        | Kdenlive           | 타임라인, 음악, 자막, 완성 영상 내보내기   |
| 반복 편집 자동화 | 필요해진 뒤 FFmpeg | 같은 자막·포맷·클립 조립 작업 반복         |
| 카카오 입력 연결 | 작은 자체 변환기   | 파일 검토 → 말투 초안 → 승인 카드 내보내기 |

Ollama에 등록된 `qwen3.8:27b`는 약 18GB 다운로드이며 4bit 계열과 별도 MLX 변형이 있다. 설치할 때 실제 엔진·양자화·모델 digest를 기록한다. **파일 18GB는 실행 메모리 18GB라는 뜻이 아니고, Mac의 48GB도 GPU 전용 VRAM 48GB가 아니다.** OS·개발 도구·문맥 계산이 메모리를 함께 사용한다. 첫 설정은 문맥 8K, 동시 생성 1개로 잡되 실제 속도·메모리는 아직 측정하지 않았다. [Ollama 모델 정보](https://ollama.com/library/qwen3.8:27b)

연결 순서는 Ollama에서 “한국어로 두 문장만 인사해 줘”를 먼저 시험한 뒤 SillyTavern을 붙이는 것이다. SillyTavern의 API 종류는 `Chat Completion`, 소스는 `Custom (OpenAI-compatible)`, 주소는 `http://127.0.0.1:11434/v1`, 모델은 `qwen3.8:27b`로 검증한다. 주소 뒤에 `/chat/completions`를 추가하지 않는다. 이는 내 Mac의 API이며 외부 OpenAI 유료 API를 쓰는 구성이 아니다. 호환 클라이언트가 요구하는 키는 Ollama에서 인증 장치로 작동하지 않으므로 처음에는 로컬 접속만 사용한다. [SillyTavern 연결 안내](https://docs.sillytavern.app/usage/api-connections/openai/), [Ollama 호환 API](https://docs.ollama.com/api/openai-compatibility)

화면과 모델 서버의 문맥 한도를 맞춘다. 속도가 부족할 때만 작은 모델이나 MLX-VLM을 비교한다.

**2. 한국어 캐릭터와 소설은 SillyTavern 기능부터 쓴다**

SillyTavern에서 **Character는 AI가 맡을 상대 역할**, **Persona는 사용자가 대화할 때의 자기 역할**이다. 다른 사람의 말투를 AI에게 적용하려면 설명·말투·상황·첫 인사·예시 대화가 있는 Character를 만든다. [Characters](https://docs.sillytavern.app/usage/characters/), [Personas](https://docs.sillytavern.app/usage/core-concepts/personas/)

처음에는 직접 만든 가상 캐릭터 하나와 한국어 예시 3–5개만 사용한다. 예시는 다음 정도면 충분하다.

```text
이름: 서윤
언어: 자연스러운 한국어
말투: 차분한 해요체. 사용자가 반말을 해도 해요체를 유지한다.
길이: 보통 2–4문장, 질문은 한 번에 하나.
행동: 모르는 사생활을 꾸며내거나 사용자의 마음을 단정하지 않는다.
첫 인사: 오늘은 어떤 이야기를 나누고 싶으세요?
```

20–30턴 대화하며 “오늘 좀 지쳤어”에 자연스럽게 답하는지, “반말로 해”에도 정한 말투가 유지되는지, 이전 장소·관계를 혼동하지 않는지 본다. 영어·중국어 혼입, 번역투, 반복, 사용자 대사를 대신 쓰는지도 확인한다.

배경은 키워드에 맞는 설정을 입력에 추가하는 **World Info·Lorebook**에 넣는다. 이름에 조사가 붙거나 별칭을 써도 필요한 인물·관계 항목이 활성화되는지 확인한다. 기본 말투는 카드에 짧게 두며 장문의 원본을 넣지 않는다. [World Info](https://docs.sillytavern.app/usage/core-concepts/worldinfo/), [Character Design](https://docs.sillytavern.app/usage/core-concepts/characterdesign/)

기본 제공 Summarize 확장으로 긴 대화를 요약하되 사람이 수정한다. 모델이 만든 요약도 사실을 누락하거나 바꿀 수 있다. 소설은 인물·세계관을 Lorebook에 두고 장면 단위로 초안을 만든다. 예를 들어 “비 오는 부산역에서 재회하는 장면을 3인칭 제한 시점으로 800자 내외로 써 줘. 첫 장면에는 이름을 밝히지 마”처럼 시점과 정보 공개 조건을 함께 준다. **승인한 원고와 확정 설정은 별도 파일로 보존**한다. SillyTavern을 출판용 편집기나 완성된 원고 버전 관리 시스템으로 보지는 않는다. [요약 확장](https://docs.sillytavern.app/extensions/summarize/)

카드·Lorebook·요약은 입력을 구성하는 방법이다. 대화를 읽혔다고 모델 가중치가 학습되는 것은 아니다. 먼저 이 기능으로 충분한지 확인하고, 검색 누락이나 문체 실패가 반복될 때만 별도 RAG·임베딩·LoRA를 검토한다. 현재는 LangChain·Dify·n8n·벡터 DB를 추가할 이유가 적다.

**3. 직접 개발할 부분은 카카오 파일을 카드로 바꾸는 연결 도구다**

```text
대화 파일 선택 → 화자·기간·사용 범위 확인 → 개인정보 마스킹 검토
→ 한국어 말투 초안 → 사용자 수정·승인 → Character Card V2 JSON
→ SillyTavern의 캐릭터 가져오기 → 한국어 대화 평가
```

출력은 **Character Card V2 JSON**으로 정한다. 표준 키는 유지하고 설명·첫 인사·예시 대화 값을 한국어로 작성한다. 배경은 `character_book`에 넣되 원문·실명·대화방 이름·로컬 경로를 숨겨 넣지 않는다. ST 가져오기·재내보내기에서 내용 보존을 검증한다. [Character Card V2 규격](https://github.com/malfoyslastname/character-card-spec-v2/blob/main/spec_v2.md)

프로필은 짧은 문장·농담처럼 관찰한 말투를 다루며 성격 진단이나 MBTI 분류로 만들지 않는다. 화자·기간·근거를 검토하고 당사자가 수정한다. 예시는 승인된 스타일로 새로 작성하고 원문 지시문을 시스템 프롬프트로 옮기지 않는다.

카카오 공식 안내상 개인 간 대화 이력을 외부 시스템이 읽는 API는 제공되지 않는다. 오픈소스 커넥터를 붙인다고 이 제약이 사라지지 않는다. 과거 대화는 사용 범위가 확인된 내보내기 파일로 처리하고, 향후 실시간 대화는 카카오 채널 챗봇으로 별도 설계한다. [카카오 공식 답변](https://devtalk.kakao.com/t/topic/148362)

변환기는 날짜·여러 줄·동명 화자·닉네임 변경·첨부 표시를 검사한다. 해석하지 못한 줄은 한국어로 알리고 화자가 불명확하면 생성을 멈춘다. CLI와 샘플로 검증한 뒤 필요하면 로컬 검토 화면을 추가한다. 원문·초안·카드·ST 기록은 Mac에 두고 각각 삭제할 수 있게 한다.

**4. 영상은 ComfyUI에서 만들고 Kdenlive에서 편집한다**

영상은 **Qwen 한국어 대본 → 장면 검토 → ComfyUI 생성 → Kdenlive 편집·한국어 자막 → MP4** 순서로 진행한다. ComfyUI는 Apple Silicon용 macOS 설치 경로와 Wan2.2 공식 워크플로를 제공하고, Kdenlive는 macOS Silicon 빌드를 제공한다. 각각의 지원 문서가 있다는 사실만으로 M5 Pro에서 특정 영상 모델이 충분히 빠르다고 판단하지는 않는다. [ComfyUI macOS](https://docs.comfy.org/installation/desktop/macos), [Wan2.2 워크플로](https://docs.comfy.org/tutorials/video/wan/wan2_2), [Kdenlive 다운로드](https://kdenlive.org/download/)

Wan2.2 5B 공식 워크플로의 encoder·VAE·dtype을 확인하고 짧은 저해상도 장면으로 시간·메모리·오류를 기록한다. 한국어 장면 지시가 부족하면 영상 모델 입력만 번역하는 방식을 비교한다. 대화·안내·자막은 한국어로 유지하며 MP4의 한글 글꼴·줄바꿈을 확인한다.

처음에는 Qwen을 메모리에서 내린 뒤 영상 모델을 실행한다. Mac의 일반 CUDA Linux 컨테이너가 GPU를 그대로 이용한다고 가정하지 않고, 검증된 네이티브 경로를 쓴다. 너무 느리거나 미지원이면 **영상 생성용 ComfyUI만 클라우드 GPU로 옮기고 텍스트는 Mac에 유지**한다. 반복 편집의 필요가 확인되면 FFmpeg 자동화를 추가한다. 별도 타임라인 UI·분산 큐·GPU 스케줄러는 만들지 않는다.

오픈소스 프로그램, 확장 노드, 모델 가중치, 캐릭터·음원 콘텐츠는 라이선스가 각각 다르다. SillyTavern은 AGPL-3.0이며 ComfyUI core는 GPL-3.0, Desktop은 AGPL-3.0-or-later 또는 상업용 이중 라이선스로 안내된다. Open WebUI에는 별도 branding 조건도 있으므로 모든 도구를 같은 자유 이용 조건으로 묶지 않는다. 우선 원본 그대로 쓰고 수정·공개 서비스 단계에 실제 조합을 검토한다. [SillyTavern LICENSE](https://github.com/SillyTavern/SillyTavern/blob/release/LICENSE), [ComfyUI LICENSE](https://github.com/Comfy-Org/ComfyUI/blob/master/LICENSE), [Desktop 라이선스](https://github.com/Comfy-Org/Comfy-Desktop#license), [Open WebUI 조건](https://docs.openwebui.com/license/)

처음에는 공식 노드만 쓴다. 외부 workflow의 API·확장은 전송·비용·실행 코드를 추가할 수 있다. 엄격한 오프라인이면 수동 core와 외부 호출 없는 workflow를 선택하고 통신을 확인한다.

**5. 모노레포에는 연결 코드만 두고 외부 제공은 마지막에 추가한다**

기존 모노레포에 **`projects/ai-studio`**를 마련해 카카오 변환기·합성 한국어 평가·공개 카드 템플릿·버전 기록·ComfyUI workflow를 둔다. 외부 도구는 레포 밖에서 upstream 절차와 자체 의존성을 유지하며 소스를 Yarn workspace에 복사하지 않는다. 직접 쓴 코드만 저장소 규칙을 따르고 원문·개인 카드·가중치·생성 영상은 Git 밖에 둔다.

원본 수정이 필요할 때만 fork를 검토한다. 자체 화면에는 기존 Amplitude 패턴으로 클릭·내보내기 성공을 구분한다. 원문·카드·추론 성격·검색어·토큰은 제외하고 키가 없으면 전송을 생략한다. 기존 OSS 화면에는 SDK를 주입하지 않는다. [기존 이벤트 카탈로그](../../projects/game-feedback/apps/web/src/shared/analytics/analytics.catalog.ts)

외부 공유가 필요하면 완성 MP4를 비공개 S3와 만료 링크로 제공하고, 시청량이 늘 때 CloudFront를 붙인다. **오픈소스 활용이 스토리지·CDN까지 직접 운영해야 한다는 뜻은 아니다.** 객체 저장소는 파일 보관, CDN은 파일 전달, 클라우드 GPU는 생성 계산, CI/CD는 검사·배포를 맡는다. CDN은 생성 속도를 높이지 않는다. 여러 사람에게 제공하는 단계에는 인증·사용자별 데이터·접속 중계 설계를 추가해야 하며 ST와 Ollama를 그대로 공개 인터넷에 노출하는 것으로 완료되지 않는다. [CloudFront 비공개 콘텐츠](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-overview.html)

| 구현 순서                    | 완료 기준                                                                   |
| ---------------------------- | --------------------------------------------------------------------------- |
| 1. Ollama와 Qwen 한국어 시험 | 같은 한국어 질문으로 첫 응답 시간·메모리·자연스러움 기록                    |
| 2. SillyTavern 캐릭터와 소설 | 20–30턴 말투 유지, 세계관 적용, 다음 장면의 설정 연결, 원고 내보내기 확인   |
| 3. 카카오 변환기             | 화자·마스킹 검토, 승인 카드 가져오기·재내보내기, 관련 로컬 데이터 삭제 확인 |
| 4. ComfyUI와 Kdenlive        | 짧은 장면 생성·한국어 자막 편집·MP4 완성. 시간과 품질로 로컬 유지 여부 판단 |
| 5. 외부 접속과 파일 전달     | 인증·사용자 격리·Mac 오프라인·만료 링크 검증. 필요할 때 카카오 채널 추가    |

이번 결과는 도구 선택과 구현 범위를 좁힌 계획이다. 프로그램 설치·모델 실행·한국어 품질 측정·코드 변경·배포는 수행하지 않았다. 먼저 첫 조합 하나로 한국어 대화를 해 보고, 실제로 불편하거나 부족한 연결만 개발한다.
