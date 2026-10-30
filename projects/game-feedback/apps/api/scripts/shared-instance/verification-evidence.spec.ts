import { describe, expect, it } from 'vitest';

import { probeLatency, verificationEvidence } from './verification-evidence';

describe('격리 컨테이너 검증 기록', () => {
  it('표본이 없으면 분포를 만들지 않고 작은 표본의 nearest-rank를 계산해야 한다', () => {
    expect(probeLatency([])).toBeNull();
    expect(probeLatency([50, 10, 20, 40, 30])).toEqual({ count: 5, p50Ms: 30, p95Ms: 50, maxMs: 50 });
    expect(() => probeLatency([NaN])).toThrow();
    expect(() => probeLatency([-1])).toThrow();
  });

  it('두 서비스 복원이 빠졌거나 검사·정리가 실패하면 완료로 기록하지 않아야 한다', () => {
    const measurement = {
      service: 'photo-contest' as const,
      backupStartedAt: '2026-10-30T00:00:00Z',
      backupCompletedAt: '2026-10-30T00:00:01Z',
      databaseRestoreMs: 300,
      verifiedTables: 4,
      verifiedRows: 10,
    };
    const options = {
      revision: 'a'.repeat(40),
      complete: true,
      durations: [20],
      failures: 0,
      restores: [measurement],
    };
    expect(verificationEvidence(options).status).toBe('incomplete');
    const both = {
      ...options,
      restores: [measurement, { ...measurement, service: 'game-feedback' as const }],
    };
    expect(verificationEvidence(both).status).toBe('passed');
    expect(verificationEvidence({ ...both, complete: false }).status).toBe('incomplete');
    expect(verificationEvidence({ ...both, failures: 1 }).status).toBe('incomplete');
  });

  it('복원 측정에 붙은 연결 정보와 원문 진단을 보고서에 복사하지 않아야 한다', () => {
    const report = verificationEvidence({
      revision: 'b'.repeat(40),
      complete: false,
      durations: [],
      failures: 0,
      restores: [
        {
          service: 'game-feedback',
          backupStartedAt: '',
          backupCompletedAt: '',
          databaseRestoreMs: 1,
          verifiedTables: 1,
          verifiedRows: 1,
          ...{ password: 'private-password', output: 'private-record' },
        },
      ],
    });
    expect(JSON.stringify(report)).not.toContain('private-');
    expect(report.productionRecoveryVerified).toBe(false);
  });
});
