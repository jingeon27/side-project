import { ApolloLink, type ApolloClient } from '@apollo/client';
import { OperationTypeNode } from 'graphql';
import { Observable, Subscription, throwError } from 'rxjs';

import { MeDocument, type MeQuery } from '@/shared/api/generated';

const AUTH_MUTATIONS = new Set([
  'StartAnonymousSession',
  'LoginWithPassword',
  'RegisterWithPassword',
] satisfies string[]);
const coordinators = new WeakMap<ApolloClient, AuthSession>();

declare module '@apollo/client' {
  interface DefaultContext {
    authSessionProbe?: boolean;
  }
}

function cachedIdentity(client: ApolloClient) {
  const session = client.readQuery({ query: MeDocument });
  return session ? (session.me?.id ?? 'anonymous') : undefined;
}

class SessionChangedError extends Error {
  constructor() {
    super('로그인 계정이 바뀌었어요. 새 계정으로 화면을 다시 열어 주세요.');
    this.name = 'SessionChangedError';
  }
}

/** 사용자 데이터는 Apollo에만 두고, 요청 세대·취소와 계정 경계의 수명만 소유한다. */
class AuthSession {
  private identity: string | undefined;
  private generation = 0;
  private switching = false;
  private refreshVersion = 0;
  private probe: AbortController | null = null;
  private readonly requests = new Set<() => void>();
  private readonly listeners = new Set<() => void>();

  constructor(private readonly client: ApolloClient) {
    this.identity = cachedIdentity(client);
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  stopRefresh = () => {
    this.refreshVersion += 1;
    this.probe?.abort();
    this.probe = null;
  };

  async accept(data: MeQuery, write = true) {
    const identity = data.me?.id ?? 'anonymous';
    const changed = this.identity !== undefined && this.identity !== identity;
    this.identity = identity;
    if (!changed) {
      if (write) this.client.writeQuery({ query: MeDocument, data });
      return false;
    }
    this.switching = true;
    this.stopRefresh();
    this.generation += 1;
    const generation = this.generation;
    // unsubscribe가 HttpLink의 fetch를 취소하며, 늦은 응답도 캐시에 도달하지 못한다.
    for (const cancel of [...this.requests]) cancel();
    await this.client.clearStore();
    if (generation !== this.generation) return true;
    this.client.writeQuery({ query: MeDocument, data });
    for (const listener of this.listeners) listener();
    return true;
  }

  async refresh() {
    this.stopRefresh();
    const version = this.refreshVersion;
    const probe = new AbortController();
    this.probe = probe;
    const result = await this.client.query({
      query: MeDocument,
      fetchPolicy: 'no-cache',
      context: {
        authSessionProbe: true,
        queryDeduplication: false,
        fetchOptions: { signal: probe.signal },
      },
    });
    if (probe.signal.aborted || version !== this.refreshVersion) return false;
    this.probe = null;
    if (!result.data) throw new Error('로그인 상태를 확인하지 못했어요.');
    return this.accept(result.data);
  }

  forward(operation: ApolloLink.Operation, forward: ApolloLink.ForwardFunction) {
    if (operation.getContext().authSessionProbe) return forward(operation);
    // 새 Me가 저장돼도 이전 폼은 문서가 교체될 때까지 남아 있을 수 있다.
    if (this.switching) return throwError(() => new SessionChangedError());
    if (
      operation.operationType === OperationTypeNode.MUTATION &&
      !AUTH_MUTATIONS.has(operation.operationName ?? '')
    ) {
      const headers = new Headers(operation.getContext().headers);
      const expected = cachedIdentity(this.client) ?? 'anonymous';
      if (this.identity === undefined) this.identity = expected;
      headers.set('X-Expected-Viewer-Id', expected);
      operation.setContext({ headers: Object.fromEntries(headers) });
    }
    return new Observable<ApolloLink.Result>((observer) => {
      const generation = this.generation;
      const subscription = new Subscription();
      const handleCancel = () => {
        subscription.unsubscribe();
        this.requests.delete(handleCancel);
        observer.error(new SessionChangedError());
      };
      this.requests.add(handleCancel);
      subscription.add(
        forward(operation).subscribe({
          next: (result) => {
            if (generation !== this.generation) return;
            if (
              'errors' in result &&
              result.errors?.some((error) => error.extensions?.code === 'UNAUTHENTICATED')
            )
              void this.refresh().catch(() => undefined);
            observer.next(result);
          },
          error: (error: unknown) => observer.error(error),
          complete: () => observer.complete(),
        }),
      );
      return () => {
        subscription.unsubscribe();
        this.requests.delete(handleCancel);
      };
    });
  }
}

export function authSession(client: ApolloClient) {
  const existing = coordinators.get(client);
  if (existing) return existing;
  const session = new AuthSession(client);
  coordinators.set(client, session);
  return session;
}

export function createAuthSessionLink() {
  return new ApolloLink((operation, forward) => authSession(operation.client).forward(operation, forward));
}

export function refreshAuthSession(client: ApolloClient) {
  return authSession(client).refresh();
}
