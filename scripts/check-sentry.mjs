/** 실제 오류 처리와 같은 옵션·정리 함수를 쓰되 HTTP 오류 경로는 만들지 않는다. */
export async function checkSentry({ sdk, options, report, service }) {
  const dsn = URL.parse(options?.dsn ?? '');
  if (!dsn || !['https:', 'http:'].includes(dsn.protocol) || !dsn.username || !/^\/\d+$/.test(dsn.pathname))
    throw new Error('SENTRY_DSN 설정을 확인해 주세요.');
  sdk.init(options);
  try {
    const responses = [];
    sdk.getClient().on('afterSendEvent', (event, response) => {
      responses.push({ eventId: event.event_id, status: response.statusCode });
    });
    report(new Error('sentry-configuration-check'), { verification: 'configuration-check', service });
    const eventId = sdk.lastEventId();
    await sdk.flush(10_000);
    const response = responses.find((entry) => entry.eventId === eventId);
    if (!response || typeof response.status !== 'number' || response.status < 200 || response.status >= 300)
      throw new Error(`Sentry 수집 확인 실패 (HTTP ${response?.status ?? '응답 없음'}).`);
    console.log(
      JSON.stringify({ service, eventId, status: response.status, environment: options.environment }),
    );
  } finally {
    await sdk.close(1000);
  }
}
