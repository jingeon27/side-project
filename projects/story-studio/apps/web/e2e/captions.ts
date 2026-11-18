import type { Locator } from '@playwright/test';

export function readCaptions(player: Locator) {
  return player.evaluate((element) => {
    const track = (element as HTMLMediaElement).textTracks[0];
    if (!track) return [];
    track.mode = 'hidden';
    return Array.from(track.cues ?? [], (cue) => ({
      text: (cue as VTTCue).text,
      start: cue.startTime,
      end: cue.endTime,
    }));
  });
}
