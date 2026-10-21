import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  IMAGE_HEADER_BYTES,
  MAX_MEDIA_ANALYSIS_BYTES,
  MAX_MEDIA_RANGE_REQUESTS,
  MEDIA_ANALYSIS_TIMEOUT_MS,
  MEDIA_RANGE_BLOCK_BYTES,
  MEDIA_RANGE_CACHE_BLOCKS,
} from '../config/limits';
import { MediaReader } from './media-reader';

function fixture(byteSize: number, blockBytes = MEDIA_RANGE_BLOCK_BYTES) {
  const storage = {
    readRange: vi.fn(async (_key: string, start: number, end: number) =>
      Buffer.alloc(end - start + 1, Math.floor(start / blockBytes) % 256),
    ),
  };
  return { storage, reader: new MediaReader(storage, 'candidate.mp4', byteSize, blockBytes) };
}

afterEach(() => vi.useRealTimers());

describe('MediaReader', () => {
  it('분석 큐 대기는 시간 제한을 쓰지 않고 첫 읽기부터 제한해야 한다', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-21T00:00:00Z') });
    const { reader, storage } = fixture(MEDIA_RANGE_BLOCK_BYTES);
    vi.setSystemTime(Date.now() + MEDIA_ANALYSIS_TIMEOUT_MS * 2);
    expect(await reader.read(0, 4)).toEqual(Buffer.alloc(4));
    vi.setSystemTime(Date.now() + MEDIA_ANALYSIS_TIMEOUT_MS - 1);
    expect(await reader.read(1, 2)).toEqual(Buffer.alloc(2));
    vi.setSystemTime(Date.now() + 1);
    await expect(reader.read(0, 1)).rejects.toThrow('Media analysis timed out');
    expect(storage.readRange).toHaveBeenCalledTimes(1);
  });

  it('동영상은 1MB 블록을 재사용하고 블록 경계의 바이트를 이어 읽어야 한다', async () => {
    const { reader, storage } = fixture(MEDIA_RANGE_BLOCK_BYTES * 2);
    expect(await reader.read(MEDIA_RANGE_BLOCK_BYTES - 2, 4)).toEqual(Buffer.from([0, 0, 1, 1]));
    expect(await reader.read(MEDIA_RANGE_BLOCK_BYTES, 2)).toEqual(Buffer.from([1, 1]));
    expect(storage.readRange.mock.calls).toEqual([
      ['candidate.mp4', 0, MEDIA_RANGE_BLOCK_BYTES - 1],
      ['candidate.mp4', MEDIA_RANGE_BLOCK_BYTES, MEDIA_RANGE_BLOCK_BYTES * 2 - 1],
    ]);
  });

  it('사진 헤더는 128KB만 가져오고 PNG 청크 검사는 같은 캐시를 재사용해야 한다', async () => {
    const { reader, storage } = fixture(IMAGE_HEADER_BYTES * 2, IMAGE_HEADER_BYTES);
    expect((await reader.read(0, IMAGE_HEADER_BYTES)).length).toBe(IMAGE_HEADER_BYTES);
    expect((await reader.read(8, 8)).length).toBe(8);
    expect(storage.readRange.mock.calls).toEqual([['candidate.mp4', 0, IMAGE_HEADER_BYTES - 1]]);
  });

  it('캐시는 최근 사용한 블록만 유지하고 파일 마지막 읽기는 실제 크기로 잘라야 한다', async () => {
    const { reader, storage } = fixture(MEDIA_RANGE_CACHE_BLOCKS + 2, 1);
    for (let index = 0; index < MEDIA_RANGE_CACHE_BLOCKS; index++) await reader.read(index, 1);
    await reader.read(0, 1);
    await reader.read(MEDIA_RANGE_CACHE_BLOCKS, 1);
    await reader.read(0, 1);
    await reader.read(1, 1);
    expect(storage.readRange.mock.calls.map(([, start]) => start)).toEqual([0, 1, 2, 3, 4, 1]);
    expect(await reader.read(MEDIA_RANGE_CACHE_BLOCKS + 1, 10)).toEqual(
      Buffer.from([MEDIA_RANGE_CACHE_BLOCKS + 1]),
    );
  });

  it('작은 사진 블록을 반복 탐색하더라도 저장소 요청 수 상한을 지켜야 한다', async () => {
    const { reader, storage } = fixture(MAX_MEDIA_RANGE_REQUESTS + 1, 1);
    for (let index = 0; index < MAX_MEDIA_RANGE_REQUESTS; index++) await reader.read(index, 1);
    await expect(reader.read(MAX_MEDIA_RANGE_REQUESTS, 1)).rejects.toThrow('Media analysis limit exceeded');
    expect(storage.readRange).toHaveBeenCalledTimes(MAX_MEDIA_RANGE_REQUESTS);
  });

  it('1MB 블록 누적 전송량 상한을 넘기기 전에 저장소 읽기를 중단해야 한다', async () => {
    const { reader, storage } = fixture(MAX_MEDIA_ANALYSIS_BYTES + MEDIA_RANGE_BLOCK_BYTES);
    for (let offset = 0; offset < MAX_MEDIA_ANALYSIS_BYTES; offset += MEDIA_RANGE_BLOCK_BYTES)
      await reader.read(offset, 1);
    await expect(reader.read(MAX_MEDIA_ANALYSIS_BYTES, 1)).rejects.toThrow(
      'Media analysis byte limit exceeded',
    );
    expect(storage.readRange).toHaveBeenCalledTimes(MAX_MEDIA_ANALYSIS_BYTES / MEDIA_RANGE_BLOCK_BYTES);
  });

  it('짧은 저장소 응답과 잘못된 범위는 바이트 반복 없이 거부해야 한다', async () => {
    const { reader, storage } = fixture(100);
    storage.readRange.mockResolvedValueOnce(Buffer.alloc(0));
    await expect(reader.read(0, 8)).rejects.toThrow('Incomplete media range');
    await expect(reader.read(-1, 1)).rejects.toThrow('Invalid media read');
    await expect(reader.read(0, MEDIA_RANGE_BLOCK_BYTES + 1)).rejects.toThrow('Invalid media read');
    expect(storage.readRange).toHaveBeenCalledTimes(1);
  });

  it.each([0, -1, 1.5, NaN, Infinity, MEDIA_RANGE_BLOCK_BYTES + 1])(
    '블록 크기 %s는 저장소에 접근하기 전에 거부해야 한다',
    (blockBytes) => expect(() => fixture(100, blockBytes)).toThrow('Invalid media block size'),
  );
});
