interface IEvidenceProgress<TClue extends string> {
  clues: TClue[];
  solved: boolean;
}

export function evidenceProgress<TClue extends string>(caseId: string, clueIds: readonly TClue[]) {
  const storageKey = 'dawn-archive:' + caseId + ':v1';
  const empty: IEvidenceProgress<TClue> = { clues: [], solved: false };

  function readProgress(): IEvidenceProgress<TClue> {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return empty;
      const saved: unknown = JSON.parse(raw);
      if (!saved || typeof saved !== 'object' || !('clues' in saved) || !Array.isArray(saved.clues)) {
        return empty;
      }
      const seen: unknown[] = saved.clues;
      const clues = clueIds.filter((id) => seen.includes(id));
      return { clues, solved: clues.length === clueIds.length && 'solved' in saved && saved.solved === true };
    } catch {
      return empty;
    }
  }

  function saveProgress(progress: IEvidenceProgress<TClue>) {
    const saved = readProgress();
    const next = {
      clues: clueIds.filter((id) => progress.clues.includes(id) || saved.clues.includes(id)),
      solved: progress.solved || saved.solved,
    };
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // A blocked storage write still allows this investigation to finish in memory.
    }
    return next;
  }

  function nextStep(progress: IEvidenceProgress<TClue>): TClue | 'verdict' {
    return clueIds.find((step) => !progress.clues.includes(step)) ?? 'verdict';
  }

  return { readProgress, saveProgress, nextStep };
}
