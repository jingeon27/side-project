import { expect, it } from 'vitest';

import { recordingWav } from './recording-audio';

it('여러 채널을 모노 PCM으로 합치고 범위를 벗어난 소리를 잘라 재생 가능한 WAV를 만든다', () => {
  const first = new Float32Array(8000).fill(2);
  const second = new Float32Array(8000).fill(0.5);
  const bytes = recordingWav([first, second], 8000);
  const view = new DataView(bytes);
  expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe('RIFF');
  expect(view.getUint32(4, true)).toBe(bytes.byteLength - 8);
  expect(view.getUint16(22, true)).toBe(1);
  expect(view.getUint32(24, true)).toBe(8000);
  expect(view.getInt16(44, true)).toBe(32767);
  expect(view.getUint32(40, true)).toBe(16000);
});
it('타이머가 늦게 실행돼도 저장되는 녹음은 30초를 넘지 않는다', () => {
  const bytes = recordingWav([new Float32Array(24000 * 32).fill(0.25)], 24000);
  expect((bytes.byteLength - 44) / 2 / 24000).toBe(30);
});
it('짧은 녹음과 무음, 손상된 오디오를 학습 목록에 추가하기 전에 거부한다', () => {
  expect(() => recordingWav([new Float32Array(7999)], 8000)).toThrow('1초');
  expect(() => recordingWav([new Float32Array(8000)], 8000)).toThrow('소리가');
  expect(() => recordingWav([new Float32Array(8000).fill(NaN)], 8000)).toThrow('손상');
});
