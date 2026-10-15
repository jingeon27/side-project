import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import mediaInfoFactory, { isTrackType, type MediaInfo } from 'mediainfo.js';

import { fail } from '../common/errors';
import { MAX_VIDEO_BYTES, MAX_VIDEO_SECONDS } from '../config/limits';
import { processPhoto } from '../submission/photo-processor';

export interface IProcessedMedia {
  body: Buffer;
  kind: 'PHOTO' | 'VIDEO';
  contentType: string;
  extension: 'webp' | 'mp4' | 'webm';
}
@Injectable()
export class MediaProcessor implements OnModuleDestroy {
  private instance?: Promise<MediaInfo<'object'>>;
  private queue: Promise<unknown> = Promise.resolve();

  async process(body: unknown, contentType: string): Promise<IProcessedMedia> {
    if (!contentType.startsWith('video/'))
      return { body: await processPhoto(body), kind: 'PHOTO', contentType: 'image/webp', extension: 'webp' };
    if (!Buffer.isBuffer(body) || !body.length || body.length > MAX_VIDEO_BYTES)
      fail('동영상은 100MB 이하로 올려 주세요.');
    // WASM 인스턴스는 동시에 두 파일을 분석할 수 없어 순서대로 재사용한다.
    const work = this.queue.then(async () => {
      this.instance ??= mediaInfoFactory({ format: 'object' });
      const info = await this.instance;
      const result = await info.analyzeData(body.length, (size, offset) =>
        body.subarray(offset, offset + size),
      );
      const tracks = result.media?.track ?? [];
      const general = tracks.find((track) => isTrackType(track, 'General'));
      const video = tracks.find((track) => isTrackType(track, 'Video'));
      const audio = tracks.filter((track) => isTrackType(track, 'Audio'));
      const duration = Math.max(...[general, video, ...audio].map((track) => Number(track?.Duration ?? 0)));
      const mp4 = general?.Format === 'MPEG-4' && video?.Format === 'AVC';
      const webm = general?.Format === 'WebM' && ['VP8', 'VP9'].includes(video?.Format ?? '');
      const validAudio = audio.every(
        (track) => (mp4 ? ['AAC'] : ['Opus', 'Vorbis']).includes(track.Format ?? '') && !track.Encryption,
      );
      if (
        (!mp4 && !webm) ||
        !validAudio ||
        video?.Encryption ||
        !video?.Width ||
        !video.Height ||
        !Number.isFinite(duration) ||
        duration <= 0 ||
        duration > MAX_VIDEO_SECONDS
      )
        fail('재생 가능한 MP4(H.264) 또는 WebM 동영상을 5분 이하로 올려 주세요.');
      return {
        body,
        kind: 'VIDEO' as const,
        contentType: mp4 ? 'video/mp4' : 'video/webm',
        extension: mp4 ? ('mp4' as const) : ('webm' as const),
      };
    });
    this.queue = work.catch(() => undefined);
    return work;
  }
  async onModuleDestroy() {
    await this.queue;
    (await this.instance)?.close();
  }
}
