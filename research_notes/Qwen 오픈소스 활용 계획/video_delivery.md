# 영상 생성 편집과 배포 오픈소스 재사용

## 영상 기능은 무엇을 재사용할까

### Takeaway

Mac M5 Pro 48GB에서는 **ComfyUI로 생성 워크플로를 실행하고 Kdenlive로 영상 편집**하는 조합부터 쓴다. 반복 편집만 FFmpeg로 자동화한다. 영상 타임라인과 모델 실행 엔진을 새로 만들지 않는다.

### Cited Findings

- 공식 Comfy Desktop의 macOS 요구사항은 macOS 13 이상, Apple Silicon M1 이상이다. 설치한 ComfyUI들을 독립 환경으로 관리한다. 따라서 M5 Pro는 문서의 Apple Silicon 계열 요구에 해당하지만, 모든 모델·노드가 해당 장비에서 작동한다는 실측 결과는 아니다. [macOS 설치 문서](https://docs.comfy.org/installation/desktop/macos)
- ComfyUI는 Wan2.2의 5B TI2V, 14B T2V/I2V 등을 위한 공식 native workflow와 다운로드 목록을 제공한다. 5B 예제는 diffusion model 외에 VAE와 text encoder가 필요하고, 예제 encoder는 FP8 형식이다. ComfyUI 문서의 8GB VRAM offload 설명은 M5의 48GB 통합메모리에서 속도·정확한 호환성을 보장하지 않는다. [공식 Wan2.2 워크플로](https://docs.comfy.org/tutorials/video/wan/wan2_2)
- Kdenlive는 비선형 타임라인, 효과·전환·색상·오디오·자막 작업을 제공한다. 다운로드 페이지에는 macOS Silicon 공식 빌드가 있다. [기능](https://kdenlive.org/), [다운로드](https://kdenlive.org/download/)
- Shotcut도 macOS와 Apple Silicon을 지원하며 대안이 될 수 있다. 프로젝트 저장과 완성 영상 export는 구분된다. [Shotcut FAQ](https://www.shotcut.org/FAQ/)
- Docker Desktop의 일반 Linux 컨테이너 `--gpus` passthrough 문서는 Windows WSL2 대상으로 설명한다. Docker Model Runner의 별도 플랫폼별 GPU 가속과 일반 CUDA 컨테이너 passthrough는 같은 기능이 아니다. [Docker GPU 지원](https://docs.docker.com/desktop/features/gpu/)

### Inferences

- 선택은 **ComfyUI + Kdenlive**, FFmpeg는 나중에 반복 작업을 줄이는 도구로 추가한다. Shotcut까지 동시에 배우거나 자체 타임라인 UI를 만들지 않는다.
- 흐름은 Qwen으로 한국어 대본/장면 목록 작성 → 사람이 검토 → ComfyUI에서 짧은 장면 생성 → Kdenlive에서 장면 순서·음악·한국어 자막 편집 → MP4 export. 모델이 한국어 프롬프트에 충분히 따르는지는 따로 평가하고 필요하면 Qwen으로 생성 지시만 번역한다. 자막 한글 글꼴·줄바꿈·렌더링도 실제 export로 확인한다.
- 첫 실험은 Wan2.2 5B 공식 native template를 후보로 삼되, 낮은 해상도·적은 프레임으로 시작해 걸린 시간/peak memory/swap/출력 오류를 기록한다. Mac 지원 문제가 난다면 노드·dtype·encoder 조합을 확인한다. “메모리에 들어감”과 “기다릴 만한 속도”는 별개다.
- Mac이 영상 생성 목표를 충족하면 로컬 유지, 미지원/너무 느리면 텍스트 Qwen은 Mac에 두고 영상 생성 ComfyUI만 선택적 cloud GPU로 옮긴다. 어떤 데이터를 올리는지와 비용은 먼저 보여준다. CDN을 붙여도 생성은 빨라지지 않는다.
- Qwen과 영상 모델을 한 번에 상주시켜 48GB를 가득 채우기보다 처음에는 하나씩 실행한다. 48GB는 OS·앱·GPU가 공유하는 총량이며 전용 VRAM 48GB가 아니다.
- Mac 모델 가속은 검증된 native 런타임을 기본으로 사용한다. 웹 UI/API/DB를 Docker Compose로 관리하는 선택과 Mac 모델을 일반 CUDA Linux 컨테이너로 실행하는 선택을 혼동하지 않는다.
- OSS가 이미 제공하는 실행 대기열·workflow 저장·취소 기능을 먼저 사용하고, 여러 도구를 통합할 실제 필요가 생겼을 때 얇은 API 연결을 만든다. 초기부터 자체 분산 큐·GPU scheduler를 만드는 범위는 제외한다.

### Gaps

- M5 Pro 48GB 실기기에서 Wan2.2의 정확한 실행 성공·생성시간·최대 프레임은 미검증이다. 단순히 Apple Silicon 지원과 Wan workflow 지원이 각각 있다는 사실을 결합해 “실용적으로 잘 돈다”고 주장하지 않는다.
- 한국어 자막·한국어 장면 지시 정확도, 사용자의 macOS 버전도 실제 시험하지 않았다. 이번에는 설치·모델 다운로드·코드 수정 없이 문서 조사만 수행했다.

## 라이선스와 사용자 데이터에서 알아야 할 점은 무엇인가

### Takeaway

프로그램, 확장 노드, 워크플로, 모델 가중치는 각각 라이선스가 다를 수 있다. 우선 기존 앱을 로컬에서 쓰고, 서비스를 배포하거나 소스를 수정·재배포할 때 해당 구성의 조건을 확인한다.

### Cited Findings

- ComfyUI core의 LICENSE는 GPL v3다. [ComfyUI LICENSE](https://github.com/Comfy-Org/ComfyUI/blob/master/LICENSE)
- 최신 Comfy Desktop 공식 README는 AGPL-3.0-or-later 또는 commercial dual license를 명시한다. Desktop을 core GPL과 같은 라이선스라고 쓰면 안 된다. 일부 bridge types의 MIT 예외가 전체 프로그램에 적용되지 않는다고도 설명한다. [Desktop README 라이선스](https://github.com/Comfy-Org/Comfy-Desktop/blob/main/README.md#license)
- 공식 workflow 저장소는 자체 GPL-3.0을 밝히면서 model과 custom node는 각자 라이선스를 유지한다고 명시한다. “local workflow”에도 partner API node가 있으면 외부 hosted model과 유료 credit을 사용할 수 있다. [공식 workflows](https://github.com/Comfy-Org/workflows)
- FFmpeg 기본 라이선스는 LGPL 2.1 이상이지만 optional GPL 부분을 사용한 빌드는 GPL이 적용된다. 공식 문서가 빌드 옵션/연결/재배포 조건을 별도로 설명한다. 모든 FFmpeg 바이너리를 같은 LGPL 조건으로 가정하면 안 된다. [FFmpeg legal](https://ffmpeg.org/legal.html)
- custom node는 Python 의존성을 설치하는 확장이다. Registry는 arbitrary system calls, custom pip wheels 등 악성 동작을 검사하는 기준과 버전 고정을 설명한다. [Custom Nodes](https://docs.comfy.org/basic-concepts/custom-nodes), [Registry](https://docs.comfy.org/registry/overview)
- 최신 Desktop 문서는 업데이트 확인과 파일 다운로드가 자동으로 일어나며 해당 확인/다운로드를 끌 수 없다고 설명한다. 자동 적용 설정과 네트워크 요청 자체는 다르다. [macOS 설치/업데이트](https://docs.comfy.org/installation/desktop/macos)

### Inferences

- 사용자에게 줄 설명은 “오픈소스 무료 사용, 상업 사용, 수정본 공개, 모델 결과물 권리는 서로 다른 질문” 정도로 먼저 충분하다. 배포 구성이 정해지기 전에 광범위한 법률 체크리스트를 만들 필요는 없다.
- 원본을 수정하지 않고 설치해 쓰는 것이 첫 선택이다. 실제 upstream 변경이 필요할 때만 해당 프로젝트의 fork를 만들어 upstream 병합이 가능한 상태로 유지한다. AGPL 수정본을 네트워크 서비스로 제공하는 경우 해당 소스 제공 등 조건을 검토한다. 별도 레포로 나눴다는 사실만으로 라이선스 의무가 없어지는 것은 아니다.
- 다운로드한 workflow JSON은 단순 레시피처럼 보이지만 확장 설치·외부 모델 호출을 요구할 수 있다. 처음에는 공식 core nodes만 사용하고, 필요한 custom node만 출처/버전을 확인해 추가한다. 카카오 원문 데이터와 서비스 자격 증명이 있는 환경에 임의 확장을 무제한 설치하지 않는다.
- “모델 계산이 로컬”과 “네트워크 송신이 전혀 없음”은 다르다. partner nodes를 쓰면 입력이 외부로 갈 수 있고 updater도 통신한다. 엄격한 오프라인 필요 시 수동 core 설치와 외부 호출 없는 workflow를 선택하고 실제 네트워크를 확인한다. updater 통신이 원문 카카오 대화를 보낸다는 뜻은 아니다.

### Gaps

- 최종 설치 버전·custom nodes·배포/수정 형태가 정해지지 않았으므로 라이선스 준수 판정을 완료한 것은 아니다. 공식 모델/노드별 파일과 도입 버전을 고정할 때 다시 확인한다.

## 배포와 레포는 어떻게 최소한으로 운영할까

### Takeaway

기존 모노레포에는 연결 코드·설정·검증 자료만 둔다. ComfyUI/Kdenlive 같은 큰 upstream 프로젝트를 통째로 복사하거나 모든 외부 도구를 Yarn으로 바꾸지 않는다. OSS 활용과 클라우드 저장소/CDN 관리형 서비스 활용은 함께 가능하다.

### Cited Findings

- 저장소는 프로젝트별 `projects/<name>` 및 앱/프로젝트 패키지 독립 구성을 지원하고, 여러 프로젝트가 실제 공유하는 코드만 루트 packages로 올리도록 정한다. [AGENTS.md](/Users/gimjingeon/Desktop/safedoc/side-project/AGENTS.md), [package.json](/Users/gimjingeon/Desktop/safedoc/side-project/package.json)
- 현재 운영 지식과 설정은 Caddy·Docker Compose·AWS S3를 포함한다. 모델 inference를 기존 작은 공유 EC2에 함께 실행하는 기반은 아니다. [배포 README](/Users/gimjingeon/Desktop/safedoc/side-project/deploy/shared-instance/README.md)
- CloudFront는 비공개 콘텐츠를 signed URL/cookie로 제공하고 S3 origin은 OAC로 제한할 수 있다. 이는 managed AWS 서비스이며 OSS 프로그램을 설치해 운영하는 것과 다르다. [AWS 비공개 콘텐츠](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-overview.html)

### Inferences

- 결정: `projects/ai-studio`에 도입 도구/모델 버전 manifest, ComfyUI workflow JSON, 페르소나 프롬프트, 합성 평가 데이터, 한국어 평가 기록, 필요할 때 작은 import/integration 프로그램과 배포 설정을 저장한다. 초기부터 Next+Nest 새 플랫폼 전체를 만드는 계획으로 확장하지 않는다.
- 새로 쓰는 TS 통합 코드만 저장소 Yarn 규칙을 따른다. 외부 upstream 소스는 자체 pnpm/npm/Python 환경을 유지하며 레포 밖 설치/컨테이너/별도 fork로 관리한다. Mac 모델 파일·카카오 원문·생성 영상은 Git에 저장하지 않는다.
- 원래 OSS 프로그램 수정이 불가피할 때만 해당 upstream의 별도 fork를 사용한다. 이는 통합 프로젝트 자체를 별도 레포로 새로 만들라는 결정이 아니다.
- 혼자 Mac에서 쓰면 외부 배포 없음이 가장 작다. 다른 기기 접근이 필요하면 인증된 접속부터; 여러 사람에게 서비스를 제공할 때 웹/API+Caddy/Compose 등 현재 익숙한 도구를 재사용한다. 모델 실행 포트를 공개 인터넷에 바로 노출하지 않는다.
- 완성 MP4 공유는 private S3와 짧은 서명 URL부터. 시청량이 늘거나 전송 지연이 문제일 때 CloudFront CDN을 더한다. S3/CloudFront는 오픈소스가 아니지만 스토리지/CDN까지 직접 구현할 이유는 현재 없다.
- 쉽게 구분: object storage=파일 창고, CDN=파일 배달, cloud GPU=영상 만드는 계산 장치, CI/CD=코드를 검사하고 서버에 반영하는 절차. CDN·CI/CD는 Qwen이나 영상 생성 모델의 대체재가 아니다.
- 기존 OSS 앱을 그대로 쓰는 단계에 저장소의 Amplitude SDK를 억지로 주입하지 않는다. 새 통합 사용자 흐름을 구현하면 그 코드의 이벤트 카탈로그에 클릭/실제 성공을 구분하고 원문·성격 추론·프롬프트·파일명 등을 보내지 않도록 설계한다.

### Gaps

- 현재 cloud 사용 인원·예산은 미정이다. CDN이나 신규 API가 필요한 것으로 확정하지 않으며, 개인 개발/소규모 비공개 사용을 기본으로 판단한다.
