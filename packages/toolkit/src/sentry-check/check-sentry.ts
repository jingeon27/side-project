interface ISentryOptions {
  dsn?: string;
  environment?: string;
}

interface ISentryClient {
  on(
    hook: 'afterSendEvent',
    callback: (event: { event_id?: string }, response: { statusCode?: number }) => void,
  ): unknown;
}

interface ISentrySdk<TOptions> {
  init(options: TOptions): unknown;
  getClient(): ISentryClient | undefined;
  lastEventId(): string | undefined;
  flush(timeout: number): PromiseLike<boolean>;
  close(timeout: number): PromiseLike<boolean>;
}

interface ICheckSentryOptions<TOptions> {
  sdk: ISentrySdk<TOptions>;
  options: TOptions | undefined;
  report(error: Error, tags: Record<string, string>): void;
  service: string;
}

/** 서비스의 실제 오류 보고·개인정보 제거 경로로 전송하고 수집 응답을 확인한다. */
export async function checkSentry<TOptions extends ISentryOptions>({
  sdk,
  options,
  report,
  service,
}: ICheckSentryOptions<TOptions>) {
  const dsn = URL.parse(options?.dsn ?? '');
  if (
    !options ||
    !dsn ||
    !['https:', 'http:'].includes(dsn.protocol) ||
    !dsn.username ||
    !/^\/\d+$/.test(dsn.pathname)
  )
    throw new Error('SENTRY_DSN 설정을 확인해 주세요.');
  sdk.init(options);
  try {
    const client = sdk.getClient();
    if (!client) throw new Error('Sentry 클라이언트를 초기화하지 못했습니다.');
    const responses: { eventId: string | undefined; status: number | undefined }[] = [];
    client.on('afterSendEvent', (event, response) => {
      responses.push({ eventId: event.event_id, status: response.statusCode });
    });
    report(new Error('sentry-configuration-check'), { verification: 'configuration-check', service });
    const eventId = sdk.lastEventId();
    await sdk.flush(10_000);
    const response = eventId ? responses.find((entry) => entry.eventId === eventId) : undefined;
    if (!response || typeof response.status !== 'number' || response.status < 200 || response.status >= 300)
      throw new Error(`Sentry 수집 확인 실패 (HTTP ${response?.status ?? '응답 없음'}).`);
    console.log(
      JSON.stringify({ service, eventId, status: response.status, environment: options.environment }),
    );
  } finally {
    await sdk.close(1000);
  }
}
