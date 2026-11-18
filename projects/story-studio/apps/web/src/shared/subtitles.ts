function timestamp(seconds: number, separator = '.') {
  const ms = Math.round(seconds * 1000);
  return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}${separator}${String(ms % 1000).padStart(3, '0')}`;
}
export function timedSubtitles(
  cues: ReadonlyArray<{ text: string; duration: number }>,
  format: 'vtt' | 'srt' = 'vtt',
) {
  const entries: string[] = [];
  const separator = format === 'srt' ? ',' : '.';
  cues.reduce((start, cue, index) => {
    const end = start + cue.duration;
    const text = cue.text
      .trim()
      .replace(/-->/g, '→')
      .replace(/[<>]/g, '')
      .replace(/\r\n?/g, '\n')
      .replace(/\n\s*\n/g, '\n');
    entries.push(
      `${index + 1}\n${timestamp(start, separator)} --> ${timestamp(end, separator)}\n${text || ' '}`,
    );
    return end;
  }, 0);
  return `${format === 'vtt' ? 'WEBVTT\n\n' : ''}${entries.join('\n\n')}\n`;
}

export function clipCaptions(text: string, duration: number) {
  if (!text.trim() || !Number.isFinite(duration) || duration <= 0) return undefined;
  return timedSubtitles([{ text, duration }]);
}
