import { ApolloClient, ApolloLink, gql, InMemoryCache } from '@apollo/client';
import {
  TeeToReadableStreamLink,
  ReadFromReadableStreamLink,
  readFromReadableStream,
  teeToReadableStream,
  type ReadableStreamLinkEvent,
} from '@apollo/client-react-streaming';
import type { FormattedExecutionResult } from 'graphql';
import { of, Subject } from 'rxjs';
import { expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const { ReadFromReadableStreamLink: BrowserReadFromReadableStreamLink } = require(
  join(dirname(require.resolve('@apollo/client-react-streaming')), 'index.browser.cjs'),
) as Pick<typeof import('@apollo/client-react-streaming'), 'ReadFromReadableStreamLink'>;

const prepare = async () => {
  const ready = Promise.withResolvers<ReadableStreamDefaultController<ReadableStreamLinkEvent>>();
  const started = Promise.withResolvers<void>();
  const stream = new ReadableStream<ReadableStreamLinkEvent>({ start: ready.resolve });
  const controller = await ready.promise;
  const source = new Subject<FormattedExecutionResult<{ value: number }>>();
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: ApolloLink.from([
      new TeeToReadableStreamLink(),
      new ApolloLink(() => {
        started.resolve();
        return source;
      }),
    ]),
  });
  const result = client.query<{ value: number }>({
    query: gql`
      query StreamProbe {
        value
      }
    `,
    fetchPolicy: 'no-cache',
    context: teeToReadableStream(() => controller, {}),
  });
  await started.promise;
  return { client, source, stream, result };
};

const consume = (
  stream: ReadableStream<ReadableStreamLinkEvent>,
  ReadLink = BrowserReadFromReadableStreamLink,
) => {
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: ApolloLink.from([new ReadLink(), new ApolloLink(() => of({ data: { value: 11 } }))]),
  });
  const result = client.query<{ value: number }>({
    query: gql`
      query StreamProbe {
        value
      }
    `,
    fetchPolicy: 'no-cache',
    context: readFromReadableStream(stream, {}),
  });
  return { client, result };
};

it('취소된 SSR 스트림의 늦은 결과가 정상 쿼리를 중단시키지 않는다', async () => {
  const { client, source, stream, result } = await prepare();
  try {
    await stream.cancel();
    source.next({ data: { value: 7 } });
    source.complete();
    await expect(result).resolves.toMatchObject({ data: { value: 7 } });
  } finally {
    client.stop();
  }
});

it('취소된 SSR 스트림에서도 실제 API 오류는 소비자에게 전달한다', async () => {
  const { client, source, stream, result } = await prepare();
  try {
    await stream.cancel();
    const rejected = expect(result).rejects.toThrow('API failed');
    source.error(new TypeError('API failed'));
    await rejected;
  } finally {
    client.stop();
  }
});

it('열린 SSR 스트림은 결과와 완료 이벤트를 정상 전달한다', async () => {
  const { client, source, stream, result } = await prepare();
  try {
    source.next({ data: { value: 9 } });
    source.complete();
    await expect(result).resolves.toMatchObject({ data: { value: 9 } });
    await expect(Array.fromAsync(stream)).resolves.toEqual([
      { type: 'next', value: { data: { value: 9 } } },
      { type: 'completed' },
    ]);
  } finally {
    client.stop();
  }
});

it('전송 스트림 읽기 실패를 미처리 Promise 대신 쿼리 오류로 전달한다', async () => {
  const stream = new ReadableStream<ReadableStreamLinkEvent>({
    start: (controller) => controller.error(new TypeError('transport failed')),
  });
  const { client, result } = consume(stream);
  try {
    await expect(result).rejects.toThrow('transport failed');
  } finally {
    client.stop();
  }
});

it('구독 해제 시 이미 실패한 스트림 취소를 정리하고 예외를 누출하지 않는다', async () => {
  const cancel = vi.fn(async () => {
    throw new TypeError('closed transport');
  });
  const stream = new ReadableStream<ReadableStreamLinkEvent>({ cancel });
  const { client, result } = consume(stream);
  const rejected = expect(result).rejects.toThrow();
  await vi.waitFor(() => expect(stream.locked).toBe(true));
  client.stop();
  await rejected;
  expect(cancel).toHaveBeenCalledOnce();
});

it('서버 오류 이벤트는 기존 HTTP 재조회 경로를 유지한다', async () => {
  const stream = new ReadableStream<ReadableStreamLinkEvent>({
    start: (controller) => {
      controller.enqueue({ type: 'error' });
      controller.close();
    },
  });
  const { client, result } = consume(stream);
  try {
    await expect(result).resolves.toMatchObject({ data: { value: 11 } });
  } finally {
    client.stop();
  }
});

it('SSR에서 발생한 전송 오류의 내부 메시지는 브라우저로 노출하지 않는다', async () => {
  const stream = new ReadableStream<ReadableStreamLinkEvent>({
    start: (controller) => controller.error(new TypeError('private transport data')),
  });
  const { client, result } = consume(stream, ReadFromReadableStreamLink);
  try {
    await expect(result).rejects.toThrow('Redacted for security concerns');
  } finally {
    client.stop();
  }
});
