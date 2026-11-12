# 한국어 캐릭터 대화와 소설 도구

## 어떤 조합 하나로 시작할 것인가

### Takeaway

**기본 조합은 SillyTavern + Ollama + Qwen3.8-27B 양자화 모델**로 정한다. 목적이 한국어 캐릭터 대화와 소설이므로 캐릭터 카드·세계관·요약을 이미 제공하는 화면을 먼저 활용한다. M5 Pro 48GB에서 설정과 한국어 품질을 확인한 뒤, 성능 문제가 실제로 있으면 화면은 유지하고 추론 서버만 MLX-VLM으로 비교한다. Open WebUI와 KoboldCpp까지 한꺼번에 설치하지 않는다.

### Cited Findings

- SillyTavern의 캐릭터 정의는 description, personality, scenario, 첫 메시지, 예시 대화 등을 프롬프트에 배치한다. 캐릭터 정의 자체가 문맥 공간을 사용한다. — [공식 Character Design](https://docs.sillytavern.app/usage/core-concepts/characterdesign/)
- World Info는 Lorebook/Memory Book이라고도 하며 키워드로 관련 설정을 동적으로 삽입한다. 캐릭터·사용자 persona·개별 chat에 연결할 수 있지만 생성 결과가 반드시 설정을 따르는 것은 아니다. — [공식 World Info](https://docs.sillytavern.app/usage/core-concepts/worldinfo/)
- Summarize 확장은 기본 설치되어 있고 현재 연결된 모델로 요약할 수 있으며 사용자가 요약을 편집하거나 이전 상태로 돌릴 수 있다. 자동 요약은 누락·환각 가능성이 있다. — [공식 Summarize](https://docs.sillytavern.app/extensions/summarize/)
- Ollama 공식 `qwen3.8:27b`에는 18GB 모델이 있고 llama.cpp variant는 Q4_K_M 및 별도 BF16 projector로 표시된다. MLX variant도 표시된다. 모델 크기·추론 엔진·양자화·template·digest를 실제 설치 시 기록해야 한다. — [Ollama Qwen3.8 27B](https://ollama.com/library/qwen3.8:27b)
- SillyTavern은 Ollama를 로컬 backend 선택지로 문서화한다. — [공식 API 연결 목록](https://docs.sillytavern.app/usage/api-connections/)
- MLX-VLM 프로젝트는 `mlx-community/Qwen3.8-27B-4bit` 실행/서버 예제와 OpenAI 호환 chat endpoint를 문서화한다. — [MLX-VLM](https://github.com/Neywa-Labs/mlx-vlm)

### Inferences

- 이전 계획에서 MLX-VLM을 첫 후보로 잡았지만 이번 요구는 기존 도구를 최대한 쓰는 순서이므로 **Ollama의 모델 설치·실행 관리 편의**를 우선한다. 이것은 Ollama가 MLX보다 빠르다는 판단이 아니다. Ollama 자체도 MLX variant를 제공하므로 추후 비교에서는 제품명보다 실제 engine을 기록해야 한다.
- 권장 첫 단계는 대화 UI와 backend 한 쌍의 한국어 대화 성공이다. 카드·지식 검색·플러그인·도구 실행을 한꺼번에 켜지 않는다.
- 소설은 SillyTavern에서 인물/세계관을 유지하며 장면별 초안을 만들고, 사용자가 승인한 원고와 설정집을 별도 파일로 내보내 보존한다. 출판용 편집기·정교한 원고 버전 관리까지 이미 완성된 도구라고 주장하지 않는다.
- Open WebUI는 일반 Q&A·문서 활용·여러 사용자용 화면이 중심일 때 대안이다. 이번 캐릭터·창작 목적에서는 기본 선택을 바꿀 근거가 약하다. KoboldCpp도 GGUF 실행과 자체 UI가 가능한 대안이지만 현재 조합과 역할이 겹쳐 첫 설치에서 제외한다.

### Gaps

- 세 도구의 실사용 UX·한국어 응답·M5 Pro 속도를 직접 비교하지 않았다. Qwen 최신성·기본 모델 사양은 이전 조사에 근거하며 이번에는 Ollama 등록 및 MLX-VLM 지원 경로를 재확인했다.

## 한국어로 어떻게 연결하고 검증할 것인가

### Takeaway

**UI 한국어 번역과 모델의 한국어 대화 능력은 별개다.** 사용자 입력·캐릭터 카드·첫 인사·세계관·요약 지시를 한국어로 작성하고 한국어 응답을 직접 평가한다. 영어로 대화한 뒤 번역하는 파이프라인을 기본으로 추가하지 않는다.

### Cited Findings

- SillyTavern에는 `ko-kr.json` 한국어 UI 번역 파일이 존재한다. 이는 전체 화면의 최신 번역 완성도 보장은 아니다. — [공식 한국어 locale](https://github.com/SillyTavern/SillyTavern/blob/release/public/locales/ko-kr.json)
- Open WebUI에도 `ko-KR/translation.json`이 있다. — [공식 한국어 locale](https://github.com/open-webui/open-webui/blob/main/src/lib/i18n/locales/ko-KR/translation.json)
- SillyTavern은 API 종류에서 Chat Completion, source에서 Custom (OpenAI-compatible)를 고르는 경로를 제공한다. endpoint 끝에 `/v1`을 사용하되 `/chat/completions`는 붙이지 않는다고 문서화한다. `/v1/models` 지원 시 목록을 가져오고 미지원 시 ID 수동 입력이 가능하다. 모든 OpenAI 호환 endpoint의 완전 호환을 보장하지 않는다. — [공식 Chat Completions 연결](https://docs.sillytavern.app/usage/api-connections/openai/)
- Ollama의 호환 endpoint는 `http://localhost:11434/v1/`이며 API key는 client가 요구할 때 비어 있지 않은 값으로 넣지만 Ollama 예제에서는 무시된다. 지원 범위는 OpenAI API의 부분집합이다. 이 로컬 key는 외부 접근 보안을 제공하지 않는다. — [Ollama API 호환 문서](https://docs.ollama.com/api/openai-compatibility)

### Inferences

권장 연결 순서(향후 설치 단계의 계획이며 이번 조사에서는 실행하지 않음):

1. Ollama에서 `qwen3.8:27b`를 실행해 “한국어로 두 문장만 인사해 줘”가 되는지 먼저 본다. 48GB를 모델에 전부 배정하지 않고 macOS/IDE/브라우저 여유를 둔다.
2. SillyTavern을 별도 설치 디렉터리에서 실행하고 UI 언어를 한국어로 선택한다. 처음에는 로컬 호스트에서만 연다.
3. Chat Completion → Custom (OpenAI-compatible), base URL `http://127.0.0.1:11434/v1`, model `qwen3.8:27b`로 단순 텍스트 연결을 시험한다. 외부 OpenAI 유료 API를 사용하는 구성이 아니다. native Ollama 연결을 택하면 URL과 프롬프트 템플릿 설정이 다르므로 두 방식을 섞지 않는다.
4. 기본 캐릭터 한 명, 한국어 예시 대화 3–5개, 한국어 첫 인사부터 추가한다. 초기에는 8K 문맥, 동시 생성 1개, 대화 응답 512–1024토큰 상한으로 시작한다. 이는 실측 권장치가 아니라 작은 출발 설정이다.
5. 모델 최대 문맥과 SillyTavern의 프롬프트 예산을 맞춘다. UI만 8K/32K로 바꾼다고 backend가 같은 길이로 바뀌지는 않는다. thinking 끄기 설정이 UI에서 실제 API로 전달되는지도 확인한다. generic 호환 모드의 모든 extra parameter가 그대로 전달된다고 가정하지 않는다.
6. 20–30회 한국어 대화 후 설정을 지키는지 확인하고, 그다음 World Info와 수동 확인 가능한 요약을 켠다. 한국어 조사로 붙는 고유명사와 별칭 때문에 lorebook 키워드가 의도대로 활성화되는지도 점검한다.
7. 이후에도 속도가 문제라면 Ollama를 중지하고 같은 카드/프롬프트를 MLX-VLM의 로컬 `/v1` 서버와 비교한다. structured output, tool call, reasoning field는 기능별로 별도 검증하며 채팅 연결 성공만으로 전체 호환을 선언하지 않는다.

캐릭터 카드 출발 예시(사용자 창작 데이터, 제품 문서 인용 아님):

```text
이름: 서윤
대화 언어: 한국어
말투: 차분하고 다정한 해요체. 사용자가 반말을 해도 해요체를 유지한다.
길이: 보통 2–4문장. 질문은 한 번에 하나만 한다.
행동: 모르는 사실은 꾸며내지 않는다. 사용자의 마음을 단정하지 않는다.
첫 인사: 오늘은 어떤 이야기를 나누고 싶으세요? 천천히 말씀해 주세요.
```

한국어 합격 기준은 사람이 실제 출력을 보고 판단한다. “반말로 해”라는 입력 뒤 카드의 우선순위가 어떻게 적용되는지, 20턴 이후 해요체 유지, 존대 대상/호칭 혼동, 한국어 중 영문·중문 섞임, 직역체·동어반복, 관계 변화에 따른 톤, 사용자 대사를 대신 생성하는지 본다. 소설에는 “비 오는 부산역에서 재회한 두 사람을 3인칭 제한 시점으로 800자 내외로 써 줘. 첫 장면에는 이름을 밝히지 마”처럼 시점·정보 공개·분량 조건을 함께 주고, 다음 장면에서 설정이 이어지는지 확인한다. 한국어 공식 벤치마크 점수나 실측 품질 수치를 이번 조사에서 얻었다고 쓰지 않는다.

### Gaps

- 직접 설치·호출하지 않았으므로 UI 번역 범위, streaming·stop·thinking 처리, timeout/retry, 한국어 tokenizer 추정 오차는 미검증이다.
- 사용자의 단어 “순서”가 다른 교정을 의미할 가능성은 있으나, 현재 조사는 한국어로 대화하고 한국어 안내를 제공해야 한다는 조건으로 진행했다.

## 라이선스와 저장소에서 무엇을 구분할 것인가

### Takeaway

SillyTavern을 모노레포에 복사해 제품 코드처럼 유지하기보다 **외부 도구로 설치해 사용**하고, 직접 만든 카카오톡 변환기·검증 코드·안전한 preset만 별도 관리한다. 도구 소스 라이선스, 모델 가중치 라이선스, 가져온 캐릭터/소설 자료의 권리는 서로 다르다.

### Cited Findings

- SillyTavern release package는 AGPL-3.0, Node `>=20`이다. 따라서 저장소의 Node 24는 선언된 engine 범위에 포함되지만 실제 호환 시험을 대신하지 않는다. — [공식 package.json](https://github.com/SillyTavern/SillyTavern/blob/release/package.json), [LICENSE](https://github.com/SillyTavern/SillyTavern/blob/release/LICENSE)
- SillyTavern 공식 설치 가이드는 안정적인 release branch와 별도 설정·데이터 경로를 설명한다. macOS global 모드는 `~/Library/Application Support/SillyTavern`을 사용한다. — [공식 설치 문서](https://github.com/SillyTavern/SillyTavern-Docs/blob/main/Installation/index.md)
- Ollama는 MIT, MLX-VLM은 MIT, KoboldCpp는 AGPL-3.0으로 표시된다. — [Ollama LICENSE](https://github.com/ollama/ollama/blob/main/LICENSE), [MLX-VLM](https://github.com/Neywa-Labs/mlx-vlm), [KoboldCpp](https://github.com/LostRuins/koboldcpp)
- Open WebUI 현행 라이선스에는 branding 유지 조건과 예외가 있다. 최신 전체를 단순 BSD/MIT의 전통적인 permissive OSS라고 소개하면 부정확하다. 정확한 조건은 LICENSE가 기준이며 브랜드 제거/재판매·배포 전 적용 범위를 검토해야 한다. — [Open WebUI LICENSE](https://github.com/open-webui/open-webui/blob/main/LICENSE), [공식 해설](https://docs.openwebui.com/license/)
- Open WebUI는 native Ollama와 OpenAI-compatible 연결을 제공한다. — [공식 대안·연결 안내](https://docs.openwebui.com/alternatives/)

### Inferences

- 로컬에서 원형 그대로 쓰는 것과 소스를 수정해 다른 사람에게 네트워크 서비스로 제공하는 것은 라이선스 검토 범위가 다르다. AGPL 수정 서비스의 해당 소스 제공 의무를 고려하고, 서비스 출시 때 직접 작성 코드와 어떤 방식으로 결합했는지 확인한다. 단순 HTTP 연결만으로 모든 별도 코드의 라이선스가 자동 결정된다고 단정하지 않는다.
- SillyTavern 원본의 npm lockfile·릴리스 구조를 사용자 모노레포 Yarn workspaces에 억지로 옮기지 않는다. 외부 설치/실행은 upstream 절차, 직접 만든 모노레포 코드는 기존 Yarn 4/Node 24 규칙을 따른다.
- imported character card는 prompt override와 외부 리소스/확장 설정 등을 검토한다. 초기에는 직접 만든 한국어 카드 한 개로 시작해 문제 원인을 좁힌다. 카카오톡 원문·API key·개인 프로필은 Git에 넣지 않는다.

### Gaps

- 법적 효과는 실제 배포/결합 방식에 따라 달라진다. 이번 선택은 개인 로컬 및 소규모 비공개 검증 단계이며 상용 출시 검토를 끝낸 것이 아니다.
