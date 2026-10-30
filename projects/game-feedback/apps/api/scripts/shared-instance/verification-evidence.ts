export interface IRestoreMeasurement {
  service: 'game-feedback' | 'photo-contest';
  backupStartedAt: string;
  backupCompletedAt: string;
  databaseRestoreMs: number;
  verifiedTables: number;
  verifiedRows: number;
}

/** 순서 통계는 probe 표본의 분포이며 운영 수용량·SLO 달성률을 뜻하지 않는다. */
export function probeLatency(values: readonly number[]) {
  if (values.some((value) => !Number.isFinite(value) || value < 0))
    throw new Error('Probe durations must be finite and non-negative');
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const rank = (percentile: number) => sorted[Math.ceil(percentile * sorted.length) - 1];
  return { count: sorted.length, p50Ms: rank(0.5), p95Ms: rank(0.95), maxMs: sorted.at(-1) };
}

export function verificationEvidence({
  revision,
  complete,
  durations,
  failures,
  restores,
}: {
  revision: string;
  complete: boolean;
  durations: readonly number[];
  failures: number;
  restores: readonly IRestoreMeasurement[];
}) {
  if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error('A source revision is required');
  const services = new Set(restores.map((restore) => restore.service));
  const passed =
    complete && durations.length > 0 && failures === 0 && services.size === 2 && restores.length === 2;
  return {
    schemaVersion: 1,
    environment: 'isolated-ci-container',
    revision,
    status: passed ? 'passed' : 'incomplete',
    replacement: { latency: probeLatency(durations), failures },
    restores: restores.map((restore) => ({
      service: restore.service,
      backupStartedAt: restore.backupStartedAt,
      backupCompletedAt: restore.backupCompletedAt,
      databaseRestoreMs: restore.databaseRestoreMs,
      verifiedTables: restore.verifiedTables,
      verifiedRows: restore.verifiedRows,
    })),
    productionRecoveryVerified: false,
  };
}
