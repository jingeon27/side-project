import concurrently from 'concurrently';

const { result } = concurrently(
  [
    { command: 'yarn workspace @photo-contest/api dev', name: 'api' },
    { command: 'yarn workspace @photo-contest/web dev', name: 'web' },
  ],
  { killOthersOn: ['success', 'failure'] },
);
result.catch(() => {
  process.exitCode = 1;
});
