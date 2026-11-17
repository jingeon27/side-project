import { caption, type TProject } from '../../story/model/story';

export function wrapCaption(
  context: Pick<CanvasRenderingContext2D, 'measureText'>,
  text: string,
  width: number,
) {
  return Array.from(text.replace(/\s+/g, ' ').trim()).reduce<string[]>(
    (lines, character) => {
      const last = lines.at(-1) ?? '';
      return context.measureText(last + character).width > width && last
        ? [...lines, character]
        : [...lines.slice(0, -1), last + character];
    },
    [''],
  );
}

// Canvas composites Korean subtitles independently of the visual generation model's text rendering.
export async function exportVideo(
  project: TProject,
  signal: AbortSignal,
  progress: (message: string) => void,
) {
  if (
    !('MediaRecorder' in window) ||
    !('captureStream' in HTMLCanvasElement.prototype) ||
    !('requestVideoFrameCallback' in HTMLVideoElement.prototype)
  ) {
    throw new Error(
      '이 브라우저는 영상 합치기를 지원하지 않습니다. 최신 Chrome에서 열거나 개별 MP4와 자막을 내려받아 주세요.',
    );
  }
  if (project.scenes.some((scene) => !scene.video?.asset))
    throw new Error('모든 장면의 영상이 준비된 뒤 합칠 수 있습니다.');
  const mime = ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/mp4'].find((type) =>
    MediaRecorder.isTypeSupported(type),
  );
  if (!mime) throw new Error('이 브라우저에서 저장할 수 있는 영상 형식이 없습니다.');
  const canvas = document.createElement('canvas');
  const ratio = project.brief.ratio;
  canvas.width = ratio === '9:16' ? 720 : ratio === '1:1' ? 960 : 1280;
  canvas.height = ratio === '16:9' ? 720 : ratio === '1:1' ? 960 : 1280;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('영상 캔버스를 열 수 없습니다.');
  const audio = new AudioContext();
  const destination = audio.createMediaStreamDestination();
  // Keep the audio clock running even when a generated clip has no audio track.
  // Otherwise Chromium may wait for audio forever and emit an empty recording.
  const silence = audio.createConstantSource();
  const silenceGain = audio.createGain();
  silenceGain.gain.value = 0;
  silence.connect(silenceGain);
  silenceGain.connect(destination);
  silence.start();
  const stream = canvas.captureStream(30);
  destination.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 5_000_000 });
  const chunks: Blob[] = [];
  const recording = { error: '' };
  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data);
  };
  recorder.onerror = () => {
    recording.error = '영상 기록 중 오류가 발생했습니다.';
  };
  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });
  const video = document.createElement('video');
  video.preload = 'auto';
  video.playsInline = true;
  const source = audio.createMediaElementSource(video);
  source.connect(destination);
  const frame = { id: 0 };
  const clean = () => {
    video.pause();
    video.removeAttribute('src');
    video.load();
    cancelAnimationFrame(frame.id);
  };
  try {
    await audio.resume();
    signal.throwIfAborted();
    for (const [index, scene] of project.scenes.entries()) {
      progress(`${index + 1}/${project.scenes.length} 장면 합치는 중 , 창을 열어 두세요`);
      const loaded = new Promise<void>((resolve, reject) => {
        const dispose = () => {
          video.onloadeddata = null;
          video.onerror = null;
          signal.removeEventListener('abort', aborted);
          clearTimeout(timeout);
        };
        const aborted = () => {
          dispose();
          reject(new DOMException('중단했습니다.', 'AbortError'));
        };
        const timeout = setTimeout(() => {
          dispose();
          reject(new Error('영상 파일을 불러오는 시간이 초과되었습니다.'));
        }, 30_000);
        video.onloadeddata = () => {
          dispose();
          resolve();
        };
        video.onerror = () => {
          dispose();
          reject(new Error('영상 파일을 열 수 없습니다. 원본 스튜디오의 저장 폴더를 확인해 주세요.'));
        };
        signal.addEventListener('abort', aborted, { once: true });
      });
      const asset = scene.video?.asset;
      if (!asset) throw new Error('장면 영상이 준비되지 않았습니다.');
      video.src = asset;
      video.load();
      await loaded;
      signal.throwIfAborted();
      context.font = `600 ${Math.round(canvas.width / 33)}px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`;
      const lines = wrapCaption(context, caption(scene), canvas.width * 0.85);
      const groups = Array.from({ length: Math.ceil(lines.length / 2) }, (_, index) =>
        lines.slice(index * 2, index * 2 + 2),
      );
      const draw = () => {
        context.fillStyle = '#101216';
        context.fillRect(0, 0, canvas.width, canvas.height);
        const scale = Math.min(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
        const width = video.videoWidth * scale;
        const height = video.videoHeight * scale;
        context.drawImage(video, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
        context.font = `600 ${Math.round(canvas.width / 33)}px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`;
        const visible =
          groups[
            Math.min(groups.length - 1, Math.floor((video.currentTime / scene.duration) * groups.length))
          ] || [];
        const lineHeight = canvas.width / 24;
        const total = visible.length * lineHeight;
        if (caption(scene)) {
          context.fillStyle = 'rgba(0,0,0,.78)';
          context.fillRect(canvas.width * 0.045, canvas.height - total - 52, canvas.width * 0.91, total + 28);
          context.fillStyle = '#fff';
          context.textAlign = 'center';
          context.textBaseline = 'top';
          visible.forEach((line, lineIndex) =>
            context.fillText(line, canvas.width / 2, canvas.height - total - 38 + lineIndex * lineHeight),
          );
        }
        frame.id = requestAnimationFrame(draw);
      };
      await new Promise<void>((resolve, reject) => {
        const dispose = () => {
          video.onended = null;
          video.onerror = null;
          video.ontimeupdate = null;
          video.cancelVideoFrameCallback(firstFrame);
          signal.removeEventListener('abort', aborted);
          clearTimeout(timeout);
        };
        const finished = () => {
          dispose();
          video.pause();
          resolve();
        };
        const aborted = () => {
          dispose();
          reject(new DOMException('중단했습니다.', 'AbortError'));
        };
        const timeout = setTimeout(
          () => {
            dispose();
            reject(new Error('영상 재생이 멈췄습니다. 창을 활성화한 뒤 다시 합쳐 주세요.'));
          },
          (scene.duration + 30) * 1000,
        );
        video.onended = finished;
        video.ontimeupdate = () => {
          if (video.currentTime >= scene.duration) finished();
        };
        video.onerror = () => {
          dispose();
          reject(new Error('장면을 재생하지 못했습니다.'));
        };
        signal.addEventListener('abort', aborted, { once: true });
        // loadeddata 직후에는 drawImage가 아직 영상 표면을 읽지 못할 수 있다.
        // 첫 디코딩 프레임을 그린 뒤 기록을 시작하거나 재개해야 배경만 저장하지 않는다.
        const firstFrame = video.requestVideoFrameCallback(() => {
          try {
            draw();
            if (recorder.state === 'inactive') recorder.start(1000);
            if (recorder.state === 'paused') recorder.resume();
          } catch {
            dispose();
            reject(new Error('장면의 첫 프레임을 기록하지 못했습니다.'));
          }
        });
        video.play().catch(() => {
          dispose();
          reject(new Error('영상 재생 권한을 확인해 주세요.'));
        });
      });
      recorder.requestData();
      recorder.pause();
      cancelAnimationFrame(frame.id);
      signal.throwIfAborted();
    }
    recorder.stop();
    await stopped;
    if (recording.error) throw new Error(recording.error);
    const blob = new Blob(chunks, { type: mime });
    if (!blob.size) throw new Error('영상 기록이 비어 있습니다. 창을 활성화한 뒤 다시 합쳐 주세요.');
    return {
      blob,
      extension: mime.startsWith('video/mp4') ? 'mp4' : 'webm',
    };
  } finally {
    clean();
    if (recorder.state !== 'inactive') {
      recorder.stop();
      await stopped;
    }
    stream.getTracks().forEach((track) => track.stop());
    silence.stop();
    silence.disconnect();
    silenceGain.disconnect();
    source.disconnect();
    await audio.close();
  }
}
