import { describe, expect, it, vi } from 'vitest';

import {
  qualifiedLearningLoop,
  type EvolutionState,
  type PolicySnapshot,
  type Qualification,
} from './qualified-loop.ts';

const model = (version: number, hash: string): PolicySnapshot => ({
  version,
  weightsSHA256: hash.repeat(64),
  directory: `/model/${version}`,
  checkpoint: `/model/${version}/checkpoint`,
});
function harness() {
  const world = { stopped: false, champion: model(1, 'a'), candidate: model(2, 'b') };
  const state: EvolutionState = {
    format: 'counterpush-qualified-learning-v1',
    phase: 'initializing',
    champion: { ...world.champion },
    candidateDirectory: null,
    candidate: null,
    pendingEpisode: null,
    trainingGames: 0,
    trainingEpisodes: 0,
    comparisons: 0,
    promotions: 0,
    evaluationFile: null,
  };
  const options = {
    state,
    trainingMatches: 1,
    stopped: vi.fn(async () => world.stopped),
    newCandidateDirectory: () => '/private',
    newEvaluationFile: () => '/evaluation',
    begin: vi.fn(async () => ({ ...world.candidate })),
    restore: vi.fn(async () => ({ ...world.champion })),
    play: vi.fn(async () => ({
      directory: '/training-episode',
      result: 'loss',
      actions: 1,
      confirmed: 1,
      opponentActions: 1,
    })),
    learn: vi.fn(async () => {
      world.candidate = model(3, 'c');
    }),
    study: vi.fn(async () => {}),
    evaluate: vi.fn(async (_candidate: PolicySnapshot, _file: string): Promise<Qualification> => {
      world.stopped = true;
      return {
        complete: true,
        gate: { passed: false, reason: 'insufficient_evidence' },
        reportPath: '/evaluation',
        games: [],
      };
    }),
    promote: vi.fn(async (candidate: PolicySnapshot, report: string) => {
      world.champion = { ...candidate, qualificationReport: report };
      return { ...world.champion };
    }),
    save: vi.fn(async (_state: EvolutionState) => {}),
  };
  return { world, state, options };
}

describe('qualified model lifecycle', () => {
  it('excludes a recovered input failure from the learning goal and retries a fresh game', async () => {
    const { state, options } = harness();
    const invalid = {
      directory: '/input-recovery',
      result: 'loss',
      actions: 3,
      confirmed: 0,
      opponentActions: 0,
      learningEligible: false,
    };
    options.play.mockResolvedValueOnce(invalid);
    await qualifiedLearningLoop(options);
    expect(options.play).toHaveBeenCalledTimes(2);
    expect(options.learn).toHaveBeenCalledTimes(1);
    expect(state.trainingEpisodes).toBe(1);
    expect(state.consecutiveInputFailures).toBe(0);
  });
  it('keeps the deployed champion when the privately trained candidate fails evaluation', async () => {
    const { state, world, options } = harness();
    await qualifiedLearningLoop(options);
    expect(options.learn).toHaveBeenCalledOnce();
    expect(options.study).toHaveBeenCalledOnce();
    expect(options.promote).not.toHaveBeenCalled();
    expect(state.champion.weightsSHA256).toBe('a'.repeat(64));
    expect(world.champion.weightsSHA256).toBe('a'.repeat(64));
    expect(state.candidate?.weightsSHA256).toBe('c'.repeat(64));
    expect(state.lastDecision?.accepted).toBe(false);
  });
  it('publishes only after a complete passing assessment and then starts from the qualified champion', async () => {
    const { state, options, world } = harness();
    options.evaluate.mockImplementation(async () => {
      world.stopped = true;
      return {
        complete: true,
        gate: { passed: true, reason: 'qualified' },
        reportPath: '/evaluation',
        games: [],
      };
    });
    await qualifiedLearningLoop(options);
    expect(options.promote).toHaveBeenCalledWith(
      expect.objectContaining({ weightsSHA256: 'c'.repeat(64) }),
      '/evaluation',
    );
    expect(state.champion.weightsSHA256).toBe('c'.repeat(64));
    expect(state.promotions).toBe(1);
    expect(state.candidate).toBeNull();
  });
  it('does not promote an interrupted assessment even if a gate flag says passed', async () => {
    const { state, options } = harness();
    options.evaluate.mockResolvedValue({
      complete: false,
      gate: { passed: true, reason: 'invalid' },
      reportPath: '/evaluation',
      games: [],
    });
    await qualifiedLearningLoop(options);
    expect(options.promote).not.toHaveBeenCalled();
    expect(state.evaluationFile).toBe('/evaluation');
    expect(state.phase).toBe('evaluation_pending');
  });
  it('resumes a frozen assessment without retraining or selecting another candidate', async () => {
    const { state, world, options } = harness();
    Object.assign(state, {
      phase: 'evaluation_pending',
      candidate: { ...world.candidate },
      candidateDirectory: '/private',
      evaluationFile: '/existing-trial',
    });
    options.evaluate.mockImplementation(async (_candidate, file) => {
      world.stopped = true;
      return { complete: false, gate: { passed: false, reason: 'stopped' }, reportPath: file, games: [] };
    });
    await qualifiedLearningLoop(options);
    expect(options.begin).not.toHaveBeenCalled();
    expect(options.learn).not.toHaveBeenCalled();
    expect(options.study).not.toHaveBeenCalled();
    expect(options.evaluate).toHaveBeenCalledWith(state.candidate, '/existing-trial');
  });
  it('recovers a publication committed before its loop receipt without publishing twice', async () => {
    const { state, options, world } = harness();
    Object.assign(state, {
      phase: 'promoting',
      candidate: { ...world.candidate },
      evaluationFile: '/evaluation',
    });
    world.champion = { ...world.candidate, qualificationReport: '/evaluation' };
    world.stopped = true;
    await qualifiedLearningLoop(options);
    expect(options.promote).not.toHaveBeenCalled();
    expect(state.promotions).toBe(1);
    expect(state.candidate).toBeNull();
    expect(state.phase).toBe('promoted');
  });
  it('recovers a completed training episode instead of playing or learning another match first', async () => {
    const { state, options } = harness();
    state.pendingEpisode = {
      directory: '/pending',
      result: 'loss',
      actions: 1,
      confirmed: 1,
      opponentActions: 0,
    };
    await qualifiedLearningLoop(options);
    expect(options.play).not.toHaveBeenCalled();
    expect(options.learn).toHaveBeenCalledWith(expect.objectContaining({ directory: '/pending' }));
    expect(state.pendingEpisode).toBeNull();
  });
});
