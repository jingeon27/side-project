import concurrently from 'concurrently';

// 로컬 S3 대역(test-kit)을 가리키면 함께 띄운다. 실제 버킷을 지정하면 띄우지 않는다.
const localStorage = /^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(process.env.S3_ENDPOINT ?? '');

const { result } = concurrently(
  [
    ...(localStorage ? [{ command: 'yarn workspace @photo-contest/test-kit s3', name: 's3' }] : []),
    { command: 'yarn workspace @photo-contest/api dev', name: 'api' },
    { command: 'yarn workspace @photo-contest/web dev', name: 'web' },
  ],
  { killOthersOn: ['success', 'failure'] },
);
result.catch(() => {
  process.exitCode = 1;
});
