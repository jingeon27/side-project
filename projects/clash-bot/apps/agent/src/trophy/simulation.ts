import { join } from 'node:path';

import { readOptionalJsonFile } from '../shared/json-file.ts';
import type { TrophyLearnerPort } from './learner-client.ts';
import { SIMULATION_CANDIDATE_FILE, simulationCandidateSchema } from './protocol.ts';
import type { State } from './session-state.ts';

// 자가개선 감독이 넘긴 시뮬레이터 챔피언 가운데 아직 실전에서 비교하지 않은 것을 후보 자리에 둔다.
// 학습하던 PPO 후보는 평가가 끝날 때까지 보관한다. 같은 가중치는 다시 평가하지 않는다.
export async function adoptSimulationOffer(control: string, state: State, learner: TrophyLearnerPort) {
  const offer = await readOptionalJsonFile(
    join(control, SIMULATION_CANDIDATE_FILE),
    simulationCandidateSchema,
  );
  if (
    !offer ||
    state.simulation.tried.includes(offer.weightsSHA256) ||
    offer.weightsSHA256 === state.champion.weightsSHA256
  )
    return false;
  const snapshot = await learner.importPolicy(
    offer.policy,
    Math.max(state.champion.version, state.candidate.version) + 1,
    state.behaviorSHA256,
    state.champion.weightsSHA256,
  );
  if (snapshot.weightsSHA256 !== offer.weightsSHA256)
    throw new Error('넘겨받은 시뮬레이터 정책이 바뀌었습니다.');
  state.simulation.tried.push(offer.weightsSHA256);
  state.simulation.parked = state.candidate;
  state.simulation.current = {
    league: offer.league,
    version: offer.version,
    weightsSHA256: offer.weightsSHA256,
  };
  state.candidate = snapshot;
  return true;
}

// 지금 평가 중인 후보가 어디서 왔는지다. 평가 보고서와 상태에 함께 남긴다.
export const candidateSource = (state: State) =>
  state.simulation.current
    ? ({ type: 'simulation', ...state.simulation.current } as const)
    : ({ type: 'own_play' } as const);

// 시뮬레이터 후보의 평가가 끝나면, 떨어졌을 때 보관한 PPO 후보로 돌아가 실전 학습을 잇는다.
export function settleSimulationTrial(state: State, passed: boolean) {
  if (!state.simulation.current) return;
  if (!passed && state.simulation.parked) state.candidate = state.simulation.parked;
  state.simulation.parked = null;
  state.simulation.current = null;
}
