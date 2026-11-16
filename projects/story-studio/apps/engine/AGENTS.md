# Story Studio Python engine

- 상위 Story Studio 지침을 따른다. 이 앱은 Python 핵심 런타임을 소유하며 UI·HTTP 계약은 형제 `web` 앱에 둔다.
- 공개 실행 계약은 `python -m story_studio`의 JSON 표준 입출력, `--data-dir`, `--examples-dir`다. 진단을 표준 출력에 쓰지 않는다.
- 모델·GPU 수명과 상태 저장을 생성 함수에 중복 구현하지 않는다. 무거운 라이브러리는 해당 작업에서만 불러와 모델 없는 상태 검사와 CLI 안내가 동작하게 한다.
- Python 의존성은 `pyproject.toml`, 모델 revision은 패키지의 `models.json`에서 관리한다. 수동 경로 조작으로 형제 Python 파일을 불러오지 않는다.
- 실행·검증 절차는 [README](README.md)를 따른다. 테스트는 이 앱의 구현 옆에 두며 웹 테스트는 Python 실행 경계만 확인한다.
