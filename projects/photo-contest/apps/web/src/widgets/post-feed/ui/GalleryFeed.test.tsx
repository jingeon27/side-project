import { ApolloClient, ApolloLink, InMemoryCache } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { GalleryFeed } from './GalleryFeed';

describe('GalleryFeed', () => {
  it('이름 있는 인기 목록을 이름 없는 보조 영역으로 다시 감싸지 않아야 한다', () => {
    render(
      <ApolloProvider client={new ApolloClient({ cache: new InMemoryCache(), link: ApolloLink.empty() })}>
        <GalleryFeed
          latest={<section aria-label="최신 게시물" />}
          popular={<section aria-label="이달의 인기" />}
        />
      </ApolloProvider>,
    );
    expect(screen.getByRole('region', { name: '이달의 인기' })).toBeInTheDocument();
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });
});
