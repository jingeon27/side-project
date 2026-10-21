import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { imageSize } from 'image-size';
import mediaInfoFactory, {
  isTrackType,
  type AudioTrack,
  type GeneralTrack,
  type MediaInfo,
  type VideoTrack,
} from 'mediainfo.js';

import { fail } from '../common/errors';
import { IMAGE_HEADER_BYTES, MAX_INPUT_PIXELS, MAX_VIDEO_SECONDS } from '../config/limits';
import type { IMediaReader } from '../storage/media-reader';
import { postUploadPolicy } from './post-upload.policy';

@Injectable()
export class MediaProcessor implements OnModuleDestroy {
  private instance?: Promise<MediaInfo<'object'>>;
  private queue: Promise<unknown> = Promise.resolve();

  async process(reader: IMediaReader, contentType: string) {
    const policy = postUploadPolicy(contentType, reader.byteSize);
    if (policy.kind === 'PHOTO') {
      try {
        const header = await reader.read(0, Math.min(IMAGE_HEADER_BYTES, reader.byteSize));
        const size = imageSize(header);
        const types: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
        const animatedWebp =
          size.type === 'webp' &&
          header.toString('ascii', 12, 16) === 'VP8X' &&
          Boolean((header[20] ?? 0) & 2);
        if (
          types[size.type ?? ''] !== contentType ||
          !size.width ||
          !size.height ||
          size.width * size.height > MAX_INPUT_PIXELS ||
          animatedWebp
        )
          fail('지원하지 않는 사진 형식 또는 크기입니다.');
        if (size.type === 'png') await this.validatePng(reader);
        return { kind: policy.kind, contentType, extension: policy.extension };
      } catch {
        return fail('사진의 형식과 크기를 확인해 주세요.');
      }
    }
    // WASM 인스턴스 하나를 여러 분석이 동시에 사용하지 않는다.
    const work = this.queue.then(async () => {
      this.instance ??= mediaInfoFactory({ format: 'object', chunkSize: 64 * 1024 });
      const info = await this.instance;
      const result = await info.analyzeData(reader.byteSize, (size, offset) => reader.read(offset, size));
      const tracks = result.media?.track ?? [];
      const general = tracks.find((track): track is GeneralTrack => isTrackType(track, 'General'));
      const video = tracks.find((track): track is VideoTrack => isTrackType(track, 'Video'));
      const audio = tracks.filter((track): track is AudioTrack => isTrackType(track, 'Audio'));
      const duration = Math.max(...[general, video, ...audio].map((track) => Number(track?.Duration ?? 0)));
      const mp4 = contentType === 'video/mp4' && general?.Format === 'MPEG-4' && video?.Format === 'AVC';
      const webm =
        contentType === 'video/webm' &&
        general?.Format === 'WebM' &&
        ['VP8', 'VP9'].includes(video?.Format ?? '');
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
      return { kind: policy.kind, contentType, extension: policy.extension };
    });
    this.queue = work.catch(() => undefined);
    try {
      return await work;
    } catch {
      return fail('재생 가능한 MP4(H.264) 또는 WebM 동영상을 5분 이하로 올려 주세요.');
    }
  }
  private async validatePng(reader: IMediaReader) {
    let offset = 8;
    for (let chunks = 0; chunks < 64 && offset + 8 <= reader.byteSize; chunks++) {
      const header = await reader.read(offset, 8);
      const type = header.toString('ascii', 4, 8);
      if (type === 'acTL') fail('움직이는 사진은 지원하지 않습니다.');
      if (type === 'IDAT') return;
      offset += header.readUInt32BE(0) + 12;
    }
    fail('사진 헤더를 읽을 수 없습니다.');
  }
  async onModuleDestroy() {
    await this.queue;
    (await this.instance)?.close();
  }
}
