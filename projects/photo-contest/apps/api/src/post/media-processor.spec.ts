import mediaInfoFactory, { isTrackType } from 'mediainfo.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTestVideo } from '@photo-contest/test-kit';

import { MAX_VIDEO_SECONDS } from '../config/limits';
import { MediaProcessor } from './media-processor';

function reader(bytes: Buffer) {
  return {
    byteSize: bytes.length,
    read: async (offset: number, size: number) => bytes.subarray(offset, offset + size),
  };
}

async function inspectVideo(bytes: Buffer) {
  const info = await mediaInfoFactory({ format: 'object' });
  try {
    const result = await info.analyzeData(bytes.length, (size, offset) =>
      bytes.subarray(offset, offset + size),
    );
    const video = result.media?.track.find((track) => isTrackType(track, 'Video'));
    if (!video || !isTrackType(video, 'Video')) throw new Error('실제 파서가 동영상 트랙을 읽어야 합니다.');
    return video;
  } finally {
    info.close();
  }
}

describe('실제 MP4 파서의 코덱·재생 시간 검증', () => {
  let processor: MediaProcessor;
  beforeEach(() => {
    processor = new MediaProcessor();
  });
  afterEach(async () => {
    await processor.onModuleDestroy();
  });

  it('실제 H.264 MP4를 허용하고 같은 바이트를 WebM으로 선언하면 거부해야 한다', async () => {
    const video = await createTestVideo();
    expect(await inspectVideo(video)).toMatchObject({ Format: 'AVC', Width: 64, Height: 64 });
    expect(await processor.process(reader(video), 'video/mp4')).toEqual({
      kind: 'VIDEO',
      contentType: 'video/mp4',
      extension: 'mp4',
    });
    await expect(processor.process(reader(video), 'video/webm')).rejects.toMatchObject({
      extensions: { code: 'BAD_USER_INPUT' },
    });
  });

  it('컨테이너가 실제 파서에 HEVC로 인식되는 합성 MP4는 허용하지 않아야 한다', async () => {
    const video = Buffer.from(await createTestVideo());
    // ftyp의 호환 브랜드가 아닌 stsd 샘플 엔트리와 설정 상자의 코덱만 바꾼다.
    const sampleEntry = video.indexOf('avc1', video.indexOf('stsd'));
    const configuration = video.indexOf('avcC', sampleEntry);
    expect(sampleEntry).toBeGreaterThan(0);
    expect(configuration).toBeGreaterThan(sampleEntry);
    video.write('hvc1', sampleEntry, 'ascii');
    video.write('hvcC', configuration, 'ascii');
    expect(await inspectVideo(video)).toMatchObject({ Format: 'HEVC', Width: 64, Height: 64 });
    await expect(processor.process(reader(video), 'video/mp4')).rejects.toMatchObject({
      extensions: { code: 'BAD_USER_INPUT' },
    });
  });

  it('실제 파서가 5분을 초과한다고 읽는 MP4는 거부해야 한다', async () => {
    const video = Buffer.from(await createTestVideo());
    const mediaHeader = video.indexOf('mdhd');
    expect(mediaHeader).toBeGreaterThan(0);
    expect(video[mediaHeader + 4]).toBe(1);
    // fragmented MP4는 trun의 샘플 길이를 mdhd timescale로 나눈다. mvhd
    // duration만 늘리면 실제 파서가 원래 길이를 유지하므로 시간 단위를 줄인다.
    video.writeUInt32BE(100, mediaHeader + 24);
    const parsed = await inspectVideo(video);
    expect(parsed.Format).toBe('AVC');
    expect(Number(parsed.Duration)).toBeGreaterThan(MAX_VIDEO_SECONDS);
    await expect(processor.process(reader(video), 'video/mp4')).rejects.toMatchObject({
      extensions: { code: 'BAD_USER_INPUT' },
    });
  });
});
