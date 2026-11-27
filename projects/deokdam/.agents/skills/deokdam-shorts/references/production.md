# 덕담집 제작 절차

## 회차 입력

[웹 카드](../../../../apps/web/src/content/episodes.json)가 제목, 행동, 메시지, 경로를 소유한다. [컷 편집표](../../../../shorts/storylines.json)에는 컷 길이, 장면 지시, 대사와 자막을 둔다. 자막은 한 호흡씩 나누고 숫자는 말하는 형태로 읽는다. `voiceLead`로 시선과 반응 뒤에 말을 시작할 수 있다. 침묵과 메시지 컷은 `voice`와 `caption`을 생략한다.

`art`는 `shorts/art/<슬러그>-<번호>.webp`를 가리킨다. `focus`는 화면에서 잘라낼 원화의 가로와 세로 기준 위치로, 두 값 모두 0과 1 사이다. `insert`는 알림, 초안, 보낸 메시지, 바꾼 문장처럼 화면에서 읽을 글에 쓴다. `from`과 `until`은 해당 컷 안에서 나타나고 사라지는 비율이다. 결말 컷의 `endcard` 시점에 메모를 내리고 실제 웹 카드의 행동과 프로필 안내를 보여준다. 모든 컷의 `seconds` 합은 30이다. 대화할 때는 `speaker`를 바꾸고, 음악은 장면마다 필요한 시점만 `music`에 둔다. [음성·반주 출처](../../../../../story-studio/apps/engine/src/story_studio/shorts/sounds/SOURCES.md)

## 원화에서 움직이는 컷 만들기

`motion`이 있는 컷마다 등장인물이 하는 동작 하나를 `prompt`에, 재생성에 쓸 시드를 `seed`에 적는다. 카메라 구도, 인물, 옷, 소품을 원화에 맞춘다. `duration`을 적어 둔 원본 클립은 편집 길이가 바뀌어도 재사용할 수 있다. 동작이 끝난 뒤 손이나 소품이 흐트러지면 `trimEnd`로 종료할 초를 정하고 마지막 온전한 프레임을 남긴다. 1화는 휴대폰에 손이 닿은 뒤, 쿠폰을 알아보고 친구와 첫 문장을 바꿔 읽는 순서다. 새로 쓴 첫 문장은 `typed`로 천천히 드러낸다.

Story Studio의 로컬 영상 워커를 이용한다. Apple Silicon에서 Pillow와 Story Studio 영상 의존성이 설치된 가상환경의 Python 경로를 `PYTHON` 환경변수에 내보낸다. `STORY_STUDIO_DATA_DIR`에 지정할 영상 작업 폴더에는 `local/models/video-wan2.2-ti2v-5b`의 MLX 변환 모델과 `local/models/tokenizer`가 필요하다. 덕담집 작업의 기본 데이터 폴더는 `projects/deokdam/.data/studio-runtime`이다. [Story Studio 엔진 준비](../../../../../story-studio/apps/engine/README.md) · [Wan2.2 모델 카드](https://huggingface.co/Wan-AI/Wan2.2-TI2V-5B)

```sh
episode=baek-beonjjae-jiwonseo
export STORY_STUDIO_DATA_DIR="$PWD/projects/deokdam/.data/studio-runtime"
"$PYTHON" projects/deokdam/shorts/animate.py "$episode" --data-dir "$STORY_STUDIO_DATA_DIR"
```

결과와 생성 로그는 `.data/shorts/motion/<회차>`에 남는다. 원하는 컷을 다시 만들 때는 `--shot`으로 컷 번호를, `--output`으로 검토용 폴더를 지정한다. 동작과 얼굴을 확인한 클립을 편집에 넣는다.

## 캡처와 렌더

저장소 루트에서 `yarn workspace @deokdam/web dev`로 웹을 열고 아래처럼 생성한 컷과 웹 카드를 합성한다. 캐시와 생성물은 이 프로젝트의 `.data/shorts`에 둔다. Story Studio 로컬 가상환경은 Python 인터프리터로 사용할 수 있다. 음성 모델을 작업 전용 데이터 경로에 두려면 `STORY_STUDIO_DATA_DIR`로 그 경로를 지정한다. [Story Studio 엔진 준비](../../../../../story-studio/apps/engine/README.md)

```sh
episode=baek-beonjjae-jiwonseo
export SHORTS_HOME="$PWD/projects/deokdam/.data/shorts"
python3 projects/deokdam/shorts/prepare.py "$episode" --site http://127.0.0.1:3460 \
  --motion-dir "$SHORTS_HOME/motion/$episode" --output "$SHORTS_HOME/recut-inputs/$episode"
projects/story-studio/shorts render-story "$SHORTS_HOME/recut-inputs/$episode" "$SHORTS_HOME/export-recut/$episode"
projects/story-studio/shorts verify "$SHORTS_HOME/export-recut/$episode/short.mp4"
```

캡처는 실제 웹 카드에서 행동 문구를 대조하고 일치하면 저장한다. 대본과 구도만 확인하는 경우에는 `--motion-dir`을 생략해서 보드를 렌더할 수 있다. 대사 수정으로 다시 만들 때는 `--output`과 렌더 출력에 새 경로를 쓴다. 음성 문제는 해당 컷의 문장 길이와 화자부터 확인한다. 대화체 화자의 같은 음색으로 다시 읽을 때는 컷의 `voiceTake`를 올린다.

## 납품과 확인

- MP4를 디코딩해서 1080×1920, 30fps, 900프레임, H.264/AAC를 확인한다.
- 첫 화면, 소품을 보여주는 장면, 웹 카드가 등장하기 전과 후를 모바일 크기로 확인한다. 얼굴과 손을 문구로 가리지 않고 카드의 행동 문장 끝까지 읽혀야 한다. 몸짓과 표정은 실제 MP4의 초반, 중간, 마지막에서 확인한다. 소리를 끄고도 메시지를 보낸 사람과 이야기가 달라진 계기를 짚을 수 있어야 한다.
- 내레이션과 자막에서 숫자, 화자가 바뀌는 지점, 말끝을 확인한다. 음성 인식과 실제 재생을 구분하여 결과를 기록한다.
- `short.mp4`, `cover.jpg`, `captions.srt`, `publish.md`를 전달한다. 공개할 때는 프로필 링크에 웹 주소와 회차를 연결한다. 시청자가 프로필에서 찾을 수 있도록 안내의 제목과 링크 이름을 맞춘다. [YouTube 링크 안내](https://support.google.com/youtube/answer/13748639?hl=ko) · [YouTube AI 사용 공개](https://support.google.com/youtube/answer/14328491?hl=ko)
