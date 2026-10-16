import { ApolloLink } from '@apollo/client';
import UploadHttpLink from 'apollo-upload-client/UploadHttpLink.mjs';
import { ErrorLink } from '@apollo/client/link/error';
import { OperationTypeNode } from 'graphql';
import { throwError } from 'rxjs';

import { BACKEND_ROUTES } from '../constants/routes';
import { getErrorMessage } from '../model/error';

declare module '@apollo/client' {
  interface DefaultContext {
    /**
     * 실패를 토스트로 알릴지. 기본은 mutation만 알린다(조회 실패는 화면이 ErrorState로 보여 준다).
     * 오류를 화면 안에서 직접 보여 주는 mutation은 false로 끈다.
     */
    errorToast?: boolean;
  }
}

/** ErrorLink가 이 operation의 실패를 토스트로 알려야 하는지 */
export function shouldToastError(operation: ApolloLink.Operation) {
  return operation.getContext().errorToast ?? operation.operationType === OperationTypeNode.MUTATION;
}

/**
 * mutation 실패를 사람이 읽을 문장으로 한 번만 알린다. 화면은 mutate()를 try/catch로 감싸고
 * catch에서 다시 토스트하지 않는다(필요한 롤백·포커스 처리만 한다).
 */
export function createErrorToastLink(notify: (message: string) => void) {
  return new ErrorLink(({ error, operation }) => {
    if (shouldToastError(operation)) notify(getErrorMessage(error));
  });
}

/** 브라우저용. 같은 origin의 `/backend` 프록시로 보내고 세션 쿠키는 브라우저가 붙인다. */
export function createBrowserHttpLink() {
  return new UploadHttpLink({
    uri: BACKEND_ROUTES.GRAPHQL,
    credentials: 'same-origin',
    headers: { 'Apollo-Require-Preflight': 'true' },
    fetchOptions: { cache: 'no-store' },
  });
}

/**
 * SSR에서 클라이언트 컴포넌트를 그릴 때 쓰는 링크. 요청 쿠키를 클라이언트 코드로 넘기지 않으므로 네트워크를 쓰지 않는다.
 * 서버에서 미리 채울 데이터는 RSC의 PreloadQuery(apollo-client.server.ts)로만 받는다.
 * useQuery는 SSR에서 캐시만 읽어 이 링크까지 오지 않는다.
 */
export function createNoNetworkLink() {
  return new ApolloLink(() =>
    throwError(
      () =>
        new Error('SSR에서는 GraphQL을 직접 요청하지 않습니다. 라우트에서 PreloadQuery로 미리 불러오세요.'),
    ),
  );
}

/** 클라이언트 컴포넌트용 Apollo 링크: 오류 알림 → (브라우저) `/backend` 프록시 | (SSR) 네트워크 없음 */
export function createAppLink({
  isServer,
  onError,
}: {
  isServer: boolean;
  onError: (message: string) => void;
}) {
  return ApolloLink.from([
    createErrorToastLink(onError),
    isServer ? createNoNetworkLink() : createBrowserHttpLink(),
  ]);
}
