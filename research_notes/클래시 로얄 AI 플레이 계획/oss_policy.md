# 클래시 로얄 AI 도구와 정책 학습

## Qwen을 파인튜닝하는 방향이 적절한가

### Takeaway

**Qwen 파인튜닝을 실험 축으로 삼는 것은 적절하다. 첫 실험은 `Qwen3-4B-Instruct-2507`의 MLX 4bit 가중치에 MLX-LM으로 QLoRA SFT를 적용하고, 관측 가능한 상태 JSON을 받아 짧은 행동 JSON을 고르는 과제로 한정한다.** 최신 27B의 화면 인식·판단·조작을 한꺼번에 학습시키는 작업은 첫 단계로 권하지 않는다. 이는 게임 실력이 입증된 조합이라는 뜻이 아니라, 작은 재현 가능한 비교 실험을 만들기 위한 선택이다.

### Cited Findings

- 원본 `Qwen/Qwen3-4B-Instruct-2507`은 Apache-2.0으로 공개된 4B 텍스트 모델이며 non-thinking 전용이다. 모델 카드가 MLX-LM을 Qwen3 로컬 실행 도구 중 하나로 안내한다. Qwen 전체를 하나의 라이선스로 묶지 말고 선택한 정확한 모델의 라이선스를 확인한다. — [Qwen 공식 모델 카드](https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507)
- `mlx-community/Qwen3-4B-Instruct-2507-4bit`는 위 원본을 MLX-LM 0.26.2로 변환했다고 명시하며 Apache-2.0 표시와 MLX 실행 예제가 있다. 모델 파일 약 2.26GB는 저장 크기이며 학습 중 메모리가 아니다. — [변환 배포자의 모델 카드](https://huggingface.co/mlx-community/Qwen3-4B-Instruct-2507-4bit)
- MLX-LM 공식 문서는 LoRA/QLoRA와 JSONL chat/completion 데이터, completion만 학습하는 `--mask-prompt`, 어댑터 저장·재개·평가·생성을 제공한다. 양자화 모델을 대상으로 하면 QLoRA를 사용한다. 배치·학습 레이어 수·문맥 길이 축소와 gradient checkpointing을 메모리 조절 수단으로 안내한다. — [MLX-LM LoRA 문서](https://github.com/ml-explore/mlx-lm/blob/main/mlx_lm/LORA.md)
- 위 문서의 오래된 모델 목록에는 Qwen2까지만 적혀 있지만, 현재 소스에는 `qwen3` 모델과 `layers` 인터페이스가 있으며 공통 튜너는 `Linear`/`QuantizedLinear`에 LoRA를 붙이는 경로를 제공한다. 이는 Qwen3+공통 QLoRA 경로의 코드 근거이지 이 Mac에서 학습을 성공시켰다는 실행 증거는 아니다. — [Qwen3 구현](https://github.com/ml-explore/mlx-lm/blob/main/mlx_lm/models/qwen3.py), [공통 어댑터 변환](https://github.com/ml-explore/mlx-lm/blob/main/mlx_lm/tuner/utils.py)
- 최신 계열에 학습 지원이 전혀 없는 것은 아니다. MLX-VLM의 현재 훈련 문서는 Qwen3.5 LoRA/MTP와 `Qwen3.5-2B-4bit` 텍스트·비전 GRPO 예제를 안내한다. 다만 예제 데이터는 도구 사용법을 보여주는 용도이며 실제 과제 품질을 증명하지 않는다. 이 문서만으로 Qwen3.8-27B의 모든 LoRA 경로가 검증됐다고 확장하지 않는다. — [MLX-VLM 훈련 문서](https://github.com/Neywa-Labs/mlx-vlm/blob/main/docs/training.md)
- MLX-LM에는 Qwen3.5/Next의 GatedDeltaNet 학습 역전파가 훈련 레이어 수에 따라 느려진다는 사용자 재현 이슈가 있으며 확인 시 Open이었다. 특정 환경의 보고이고 모든 모델·버전의 실패를 뜻하지 않는다. — [공식 저장소 이슈 #1956, 2026-10-08](https://github.com/ml-explore/mlx-lm/issues/1956)

### Inferences

- 용어를 구분한다. **SFT**는 상태와 모범 행동 짝으로 정답을 따라 배우는 학습 목표다. **LoRA**는 기존 가중치를 대부분 고정하고 작은 어댑터를 학습하는 방법이다. **QLoRA**는 양자화한 기본 모델에 어댑터를 학습하는 방식이다. **강화학습**은 행동 결과의 보상을 이용한다. SFT와 QLoRA는 함께 쓸 수 있다.
- 48GB 통합 메모리를 쓴다고 48GB 전부가 학습에 주어지지 않는다. 운영체제와 앱, 기본 가중치, 중간 활성값, 어댑터·gradient·optimizer 상태가 함께 필요하다. 앞선 27B 4bit **추론** 가능성은 같은 모델의 **학습** 가능성이나 속도 보증이 아니다. 4B, 짧은 입력, 작은 배치, 일부 레이어로 시작해 peak memory와 step 시간을 측정한다. 예시 출발점은 batch 1·문맥 1K~2K·rank 8·마지막 4~8개 레이어이며 최적값이나 실측 권장값은 아니다.
- 첫 데이터는 시뮬레이터 또는 권한 있는 녹화에서 얻은 **시각에 맞춘 상태→행동**이다. 손패, 엘릭서, 남은 시간, 관측한 유닛·타워 상태, 합법적인 후보 행동을 입력한다. 예를 들어 출력은 `{"action_id":"play_2_tile_18"}` 또는 `{"action_id":"wait"}`처럼 제한한다. 해당 ID가 현재 합법 후보에 있는지 별도 코드가 검증한다. JSON 형식 준수와 전략적 좋은 선택은 별개다.
- Qwen은 한국어로 설정·설명을 제공해도, 게임 제어 출력은 작은 구조화 데이터로 유지한다. 긴 한국어 해설을 매 행동마다 생성하는 것은 지연을 늘리므로 경기 후 설명 또는 별도 요청으로 분리한다. 모델은 화면 대신 상태를 읽으므로 **이 첫 모델은 영상 인식 모델이 아니다.** 화면→상태 CV/OCR/추적은 따로 검증하며, 시뮬레이터의 숨은 상대 정보가 학습 입력에 새지 않게 한다.
- 수집한 모든 승리 장면을 정답으로 취급하지 않는다. 좋은 수비, 공격, 기다리기와 실수 사례를 검수하고, 같은 경기의 인접 프레임이 학습·검증에 나뉘지 않도록 경기/플레이어/시점 단위로 분리한다. 먼저 소수의 손검수 예제로 데이터 파이프라인을 확인하고 수백~수천 판단 장면으로 탐색한다. 이 수량은 작업 크기 예시이며 강한 플레이어에 충분하다는 근거는 없다.
- 추천 순서: ① 고정 덱·행동 후보·평가 세트 정의 → ② 규칙 정책과 미학습 Qwen 성능 기록 → ③ 동일 기본 모델에 QLoRA SFT → ④ 홀드아웃 게임에서 세 방법 비교 → ⑤ 유효 행동률·승률·의사결정 p50/p95 지연이 개선될 때만 데이터/모델 확대 → ⑥ 필요시 시뮬레이터 강화학습 또는 작은 정책망으로 증류. 자동 플레이 성능이 목표라면 같은 데이터의 작은 비언어 정책망도 비용·속도 비교 대상으로 둔다. Qwen을 쓰는 자체가 최적 실시간 정책이라는 결론은 아니다.
- 처음부터 PPO/GRPO를 실제 경기에 붙이지 않는다. 학습 가능한 환경·보상·리셋·상대·관측 계약을 만드는 비용이 있으며, MLX-VLM의 텍스트 GRPO API가 전투 환경까지 제공하지 않는다. 먼저 SFT로 기본 행동을 익힌 뒤 강화학습 필요성을 판단한다.
- 훈련과 첫 어댑터 평가/서빙을 MLX-LM 안에서 끝낸다. MLX 어댑터를 Ollama에 바로 복사하면 동작한다고 가정하지 않으며, 내보내기·병합·양자화는 별도 호환 검증 과제다. Qwen 모델 사용 허락과 공식 게임 자동 조작 허락은 별개다.

### Gaps

- M5 Pro 48GB에서 이 조합의 학습·어댑터 재로딩·지연·승률을 실행 검증하지 않았다. 모델/패키지 버전 고정과 소규모 학습 후 저장·재로딩 검사가 구현의 첫 완료 조건이다.
- Qwen3.8-27B의 현행 Mac QLoRA 학습 지원을 독립적으로 입증하는 공식 예제나 이 과제의 평가 결과는 이번 조사에서 확인하지 못했다. 앞선 창작용 추론 모델 추천을 학습 모델 선택에 그대로 옮기지 않는다.

## 실제로 가능한 방식과 기본 경로

### Takeaway

화면을 보고 자동으로 카드를 내는 기술은 연구와 공개 구현 사례가 있다. 다만 Qwen을 게임에 연결하면 곧바로 잘 플레이하는 형태는 아니다. **Mac 중심의 첫 연구 경로는 RoyaleGym의 시뮬레이터에서 작은 정책을 만들고 평가하는 것**으로 정한다. 실제 공식 게임에 입력을 보내는 경로는 기술·기기·서비스 이용 조건을 별도로 충족해야 하며 기본 계획에 포함하지 않는다. 실제 조작용 휴대폰/에뮬레이터는 미정이다.

### Cited Findings

- KataCR 논문은 화면 이미지에서 객체 검출/OCR로 특징을 추출하고 오프라인 강화학습 정책과 모바일 입력을 연결한다. 내장 AI 상대를 이긴 연구 결과를 제시한다. 이는 현재 랭크전·모든 덱·일반 유저 상대의 실력을 증명하지 않는다. — [논문 원문 페이지](https://arxiv.org/abs/2504.04783)
- RoyaleGym은 전투 시뮬레이터·관측·행동·보상·훈련기 및 뷰어를 제공하며, 게임/휴대폰/계정 없이 로컬 연구를 시작할 수 있다고 안내한다. MIT 라이선스다. — [공식 저장소](https://github.com/RoyaleGym/RoyaleGym), [공식 문서](https://royalegym.github.io/RoyaleGym/)
- RoyaleGym 설치 문서는 Python 3.12와 Apple Silicon Mac을 안내하되 **Apple GPU를 사용하지 않고 Mac 훈련은 CPU에서 실행**한다고 명시한다. 초기 릴리스라 버전을 고정하라고 안내한다. — [공식 설치 가이드](https://royalegym.github.io/RoyaleGym/install/)
- ClashRoyaleBuildABot README는 실제 Supercell 게임과의 사용을 금지한다고 경고하며 서비스 약관 위반 및 계정 제재 가능성을 명시한다. 코드가 공개됐다는 사실과 실제 서비스에서 사용할 권한은 별개다. — [프로젝트 README](https://github.com/Pbatch/ClashRoyaleBuildABot)

### Inferences

- “기술적으로 가능”과 “공식 게임에서 허용되는 사용”을 명확히 분리한다. 본 계획은 입력 없는 녹화 분석과 별도 시뮬레이션을 기본으로 하며, 친선전/훈련전이라는 이름만으로 자동화가 허용된다고 보지 않는다. 약관 상세와 공식 API 범위는 별도 조사 결과를 결합한다.
- M5 Pro 48GB는 작은 시뮬레이터 실험·분석·정책 코드 개발의 출발 장비로 삼을 수 있다. 하지만 이 저장소의 CPU 경로를 MPS 학습이 자동 지원되는 것처럼 쓰면 안 된다. 실제 학습 속도는 측정하고 GPU 클라우드 증설은 그다음 결정한다.
- 게임 AI 프로젝트는 기존 소설/캐릭터 챗봇과 실험 환경·의존성·평가 방식이 다르다. Qwen runtime을 공유하더라도 게임 정책/시뮬레이터를 별도 실행 환경과 데이터 경계로 둔다.

### Gaps

- 모델 다운로드·패키지 설치·시뮬레이터 실행·기기 제어는 하지 않았다. Mac에서의 실제 실행, 성공률, 학습 소요 시간과 현재 공식 게임 버전 호환은 미검증이다.

## 재사용할 공개 프로젝트는 무엇인가

### Takeaway

세 프로젝트의 역할이 다르다. **RoyaleGym은 Mac에서 시작할 학습 실험**, **ClashRoyaleBuildABot은 화면 상태와 규칙 기반 행동 구조의 참고**, **KataCR은 시각 인식과 학습 정책을 결합한 연구 참고**다. 이 중 여러 개를 통째로 동시에 설치하는 계획은 피한다.

### Cited Findings

| 프로젝트                    | 재사용 가치                                                             | 확인한 제약                                                                                                                      | 근거                                                                                                                                                                                     |
| --------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RoyaleGym/RoyaleGym         | 시뮬레이터 API, 보상/관측/행동 구성, 모방학습과 RL, 저장된 대국 뷰어    | 초기 릴리스; Mac CPU 학습. 훈련과 평가가 실제 게임 클라이언트가 아닌 시뮬레이터 내부에서 이루어짐                                | [README](https://github.com/RoyaleGym/RoyaleGym), [설치](https://royalegym.github.io/RoyaleGym/install/)                                                                                 |
| Pbatch/ClashRoyaleBuildABot | 아군/적군/타워 HP/카드/화면 상태 추출, 카드별 행동 점수 계산 구조       | 카드별 action을 작성하는 플랫폼. 학습완료 범용 RL 플레이어 아님. 안내된 emulator 조건은 BlueStacks·ADB·720×1280·영어 UI          | [개발 가이드](https://github.com/Pbatch/ClashRoyaleBuildABot/wiki/Bot-Development-Tutorial), [emulator 가이드](https://github.com/Pbatch/ClashRoyaleBuildABot/wiki/Emulator-Setup-Guide) |
| wty-yy/KataCR               | YOLO 검출, OCR/특징 결합, offline policy, 논문과 pretrained weight 링크 | README의 검증 경로는 Linux+NVIDIA+V4L2+JAX. 화면 비율 1080×2400 전제. 카드 분류기에는 2.6 Hog deck 제한. Mac 즉시 실행 제품 아님 | [영문 README](https://raw.githubusercontent.com/wty-yy/KataCR/master/README_en.md), [논문](https://arxiv.org/abs/2504.04783)                                                             |

- ClashRoyaleBuildABot은 MIT로 표시되며 Python 3.12와 ONNX Runtime CPU/GPU 옵션을 선언한다. 설치 wiki는 2026-06-13 수정으로 표시되지만, 이것만으로 현재 모든 게임 업데이트에 대응했다고 판단할 수 없다. — [프로젝트](https://github.com/Pbatch/ClashRoyaleBuildABot), [pyproject](https://raw.githubusercontent.com/Pbatch/ClashRoyaleBuildABot/main/pyproject.toml), [설치 wiki](https://github.com/Pbatch/ClashRoyaleBuildABot/wiki/Bot-Installation-Setup-Guide)
- KataCR 코드는 MIT이며 영문 README에 detector·classifier·policy의 Google Drive 다운로드 링크가 있다. detector 표는 2024-05-01, 정책 예제 이름도 2024년 훈련 실험을 가리킨다. 링크 존재를 확인했으며 파일 다운로드·무결성·접근 성공은 검증하지 않았다. — [저장소](https://github.com/wty-yy/KataCR), [영문 README](https://raw.githubusercontent.com/wty-yy/KataCR/master/README_en.md)
- RoyaleGym은 공개 replay에서 모방학습 데이터를 생성하는 과정을 제공한다. 지원되지 않는 카드/행동의 대국은 건너뛰며 저장된 clone에는 network/weights/environment 설정이 포함된다. 문서는 NVIDIA가 없으면 CPU 학습이 오래 걸린다고 설명한다. 해당 문서의 다른 컴퓨터 소요 시간을 M5 Pro 시간으로 옮겨 쓰지 않는다. — [Cloning a Bot](https://royalegym.github.io/RoyaleGym/clash-royale/cloning-a-bot/)
- RoyaleGym 정확도 설명은 측정한 기본 카드 중심의 calibration 대국에 한정되고 champion/evolution은 그 측정에 포함되지 않으며 원본 녹화가 비공개라 독자 재현이 안 된다고 밝힌다. 시뮬레이터에서 높은 승률이 곧 실제 게임 실력은 아니다. — [엔진 정확도](https://royalegym.github.io/RoyaleGym/accuracy/)

### Inferences

- 처음 사용할 것은 RoyaleGym 한 개다. 카메라 인식은 시뮬레이터 정책의 첫 작동에 필수가 아니므로 먼저 관측·합법 행동·보상 설계를 검증한 후 별도 녹화 영상 인식을 붙인다.
- 가장 쉽게 보이는 BuildABot도 검출 모델·배치 좌표·카드별 전략을 최신 게임에 맞춰 보정해야 한다. 영어 UI 조건이 있으므로 한국어 게임 화면에서 그대로 된다거나 macOS BlueStacks의 동일 호환이 보장된다고 쓰지 않는다.
- 코드 MIT와 게임 이미지·영상·데이터셋·가중치 사용권은 별도로 확인한다. YOLO·OCR 등 하위 의존성 라이선스도 자동으로 MIT가 되지 않는다. pretrained weight가 있다는 이유로 재배포/상용화를 확정하지 않는다.

### Gaps

- 이번 범위에서는 최신 commit 시각이나 archived API 상태를 확인하지 않았다. “활발히 유지보수된다/폐기됐다”는 단정은 하지 않는다. BuildABot README는 active development라고 주장하지만 그것을 객관적 지원 보증으로 옮기지 않는다.
- BuildABot의 현재 packaged detector weights 취득 가능성과 RoyaleGym에서 곧바로 사용할 완성 정책 checkpoint는 별도 확인 대상이다. 기본 데모의 random agent를 학습된 강한 에이전트로 소개하지 않는다.

## 상태 인식과 정책 학습을 어떻게 나눌 것인가

### Takeaway

실제 화면 기반 agent는 **화면 → 상태 추정 → 행동 선택 → 입력 → 다음 화면으로 성공 확인**의 반복이다. Qwen은 한국어 해설·리플레이 요약·학습 데이터 검토를 맡기고, 실시간 카드 선택은 규칙 기반 또는 작은 정책 모델이 맡는 구성부터 시작한다.

### Cited Findings

- BuildABot 문서는 매 단계 state를 계산하고 카드별 가능한 행동을 점수화해 선택하는 구조를 설명한다. — [Bot Development Tutorial](https://github.com/Pbatch/ClashRoyaleBuildABot/wiki/Bot-Development-Tutorial)
- KataCR은 화면 특징·정책·제어를 분리한 비임베디드 구조를 제시한다. — [논문](https://arxiv.org/abs/2504.04783)
- RoyaleGym은 먼저 인간의 replay를 모방한 정책을 만들고 이후 시뮬레이션 학습으로 개선하는 경로를 안내한다. — [RoyaleGym 문서](https://royalegym.github.io/RoyaleGym/), [모방학습 가이드](https://royalegym.github.io/RoyaleGym/clash-royale/cloning-a-bot/)

### Inferences

- **상태:** 내 손패/엘릭서/타워 HP/남은 시간, 적·아군 종류/위치/변화, 전투/결과/메뉴 구분. 화면의 오인식과 가려짐을 다루도록 직전 상태와 confidence를 저장한다. 상대 손패·엘릭서는 직접 관찰 가능 사실과 관측에서 추정한 값을 구분한다.
- **행동:** “기다리기” 또는 “손패 슬롯+배치 위치”. 엘릭서 부족·불법 배치·메뉴 상태·오래된 프레임일 때 행동을 막는다. 좌표를 모델 자유 텍스트로 직접 실행하지 않고 허용 범위와 유효성 검사에 통과시킨다. 액션 이후 손패/엘릭서/보드 변화로 성공을 확인하고 중복 클릭을 피한다.
- **처음 정책:** 고정 덱 하나, 제한된 배치 후보, 단순 방어/공격 규칙. 이것으로 시뮬레이션이 정상 종료되는지와 승패·메모리·재현 로그를 먼저 검증한다.
- **모방학습:** 사람의 상태→행동 예시를 따라 하는 지도학습이다. 영상은 행동 시점·실제 손패·카드 위치 라벨을 만들어야 하므로 “유튜브를 많이 넣으면 자동 학습”이 아니다. 같은 대국의 인접 프레임을 train/test에 섞지 않고 대국·플레이어·기간 단위로 분리한다.
- **강화학습:** 보상으로 대국 결과를 개선한다. 시뮬레이터에서 반복해 시행착오를 싸게 만들고, random/heuristic 고정 상대와 held-out 시나리오로 비교한다. 타워 피해 같은 중간 보상은 보상만 악용하는 플레이를 만들 수 있어 승패와 별도 점검한다.
- **부분관측:** 시뮬레이터가 가진 정답 전체를 정책에 넣으면 실제 화면 환경과 다르다. 실제 플레이어가 볼 수 있는 관측만 정책에 주고, 정답 상태는 인식 평가용으로 따로 보관한다.
- **Qwen의 자리:** 의사결정 로그를 한국어로 해설하고, 실수 유형·전략 가설·라벨 후보를 만드는 offline 보조. Qwen 27B로 매 프레임 장문 추론을 수행하는 구성을 기본으로 두지 않는다. 이는 M5 Pro에서 특정 ms가 나온다는 성능 주장 대신, 시각 처리·언어 생성·입력 지연을 모두 측정해야 한다는 설계 선택이다.
- **예산 측정:** frame 수신부터 정책 완료까지 지연 p50/p95, 관측 신선도, 카드/엘릭서 인식 오류, 잘못된 배치율, action/no-op 비율, 종료 판별, 고정 시드 대국 승률을 기록한다. 모델 추론 시간만으로 end-to-end 속도를 주장하지 않는다.
- **작은 실험 순서:** (1) random vs random 시뮬레이션 재현·저장 (2) 고정 덱+규칙 정책 (3) 작은 replay subset 모방학습 (4) held-out 대국 비교 (5) 짧은 RL 실험 (6) 녹화 영상의 상태 인식만 연결 (7) 조건을 충족하는 허가된 실험 환경에서만 실제 입력 연결 여부 재검토. 마일스톤은 “리플레이 저장까지 정상 종료”, “관측/행동 오류를 재현 가능”, “평가셋에서 baseline 개선”처럼 검증 가능하게 둔다.

### Gaps

- 사용자 목표 덱·시간 예산·학습 데이터 권리·기기·입력 허용 환경이 미정이다. 실행 성능이나 승률 목표 수치를 임의로 보장하지 않는다.
