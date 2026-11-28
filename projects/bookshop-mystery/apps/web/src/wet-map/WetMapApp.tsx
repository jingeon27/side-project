import { wetMapPath } from '../case-routes';
import { createComparisonCase } from '../create-comparison-case';
import { WET_MAP_ID, wetMap, wetMapCover } from './wet-map';
import { MapMarkEvidence, PlatesEvidence, WorkLogEvidence } from './WetMapEvidence';
import { WetMapEnding, wetMapFormId, WetMapVerdict } from './WetMapVerdict';

import './wet-map.css';

export const WetMapApp = createComparisonCase({
  id: WET_MAP_ID,
  path: wetMapPath,
  cover: wetMapCover,
  briefing: wetMap,
  clues: [
    { id: 'map-mark', label: '지도', action: '지도 보기', View: MapMarkEvidence },
    { id: 'plates', label: '표찰', action: '표찰 비교', View: PlatesEvidence },
    { id: 'work-log', label: '일지', action: '일지 보기', View: WorkLogEvidence },
  ],
  formId: wetMapFormId,
  Verdict: WetMapVerdict,
  Ending: WetMapEnding,
});
