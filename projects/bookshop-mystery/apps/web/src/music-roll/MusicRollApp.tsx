import { musicRollPath } from '../case-routes';
import { createComparisonCase } from '../create-comparison-case';
import { MUSIC_ROLL_ID, musicRoll, musicRollCover } from './music-roll';
import { BellRecord, FeedGuide, PaperRolls } from './MusicRollEvidence';
import { MusicRollEnding, musicRollFormId, MusicRollVerdict } from './MusicRollVerdict';

import './music-roll.css';

export const MusicRollApp = createComparisonCase({
  id: MUSIC_ROLL_ID,
  path: musicRollPath,
  cover: musicRollCover,
  briefing: musicRoll,
  clues: [
    { id: 'bell-record', label: '녹음', action: '녹음 보기', View: BellRecord },
    { id: 'feed-guide', label: '구동기', action: '구동기 보기', View: FeedGuide },
    { id: 'paper-rolls', label: '종이띠', action: '종이띠 비교', View: PaperRolls },
  ],
  formId: musicRollFormId,
  Verdict: MusicRollVerdict,
  Ending: MusicRollEnding,
});
