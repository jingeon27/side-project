// 실행 동작 해시(Counterpush 평가의 behaviorIdentity, 트로피 실험 지문)가 세지 않는 이름이다.
// 검사, 여러 검사가 함께 쓰는 준비 파일(*.fixture.ts, *_fixture.py)과 Python 캐시는 실행 동작을 바꾸지 않는다.
export const outsideBehavior = (name: string) =>
  name === '__pycache__' || /(?:\.(?:spec|test|fixture)\.ts|_(?:test|fixture)\.py|\.pyc)$/.test(name);
