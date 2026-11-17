import dayjs from 'dayjs';

// Local recording only: decode after MediaRecorder's final dataavailable/stop pair.
// decodeAudioData resamples to this offline context, without a playback/microphone graph.
export async function recordingFile(blob: Blob) {
  const decoded = await new OfflineAudioContext(1, 1, 24000).decodeAudioData(await blob.arrayBuffer());
  const channels = Array.from({ length: decoded.numberOfChannels }, (_, index) =>
    decoded.getChannelData(index),
  );
  const bytes = recordingWav(channels, decoded.sampleRate);
  return new File([bytes], `마이크 녹음 ${dayjs().format('HH시 mm분 ss초')}.wav`, { type: 'audio/wav' });
}

export function recordingWav(channels: Float32Array[], rate: number) {
  const first = channels[0];
  if (
    !first ||
    !Number.isInteger(rate) ||
    rate < 8000 ||
    rate > 96000 ||
    channels.some((channel) => channel.length !== first.length)
  )
    throw new Error('녹음한 소리를 읽지 못했습니다. 다시 녹음해 주세요.');
  const length = Math.min(first.length, rate * 30);
  if (length < rate) throw new Error('1초 이상 녹음해 주세요.');
  const bytes = new ArrayBuffer(44 + length * 2);
  const view = new DataView(bytes);
  const text = (offset: number, value: string) =>
    [...value].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, bytes.byteLength - 8, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, length * 2, true);
  first.subarray(0, length).forEach((_, index) => {
    const sample = channels.reduce((sum, channel) => sum + (channel[index] ?? 0), 0) / channels.length;
    if (!Number.isFinite(sample)) throw new Error('녹음이 손상되었습니다. 다시 녹음해 주세요.');
    const clipped = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + index * 2, Math.round(clipped * (clipped < 0 ? 32768 : 32767)), true);
  });
  if (!new Int16Array(bytes, 44).some((sample) => Math.abs(sample) >= 4))
    throw new Error('소리가 거의 들리지 않습니다. 마이크 연결과 입력 음량을 확인해 주세요.');
  return bytes;
}
