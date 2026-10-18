import type { Session, PostDetail, GameProfile, ChatMessageList, Author } from '../generated/models';
const timestamp = '2026-10-17T00:00:00.000Z';
export function authorFixture(): Author {
  return {
    id: 'player-1',
    nickname: '테스트플레이어',
    isVerified: false,
    supercellTag: '#GG829JGY',
    isTestAccount: false,
  };
}
export function sessionFixture(): Session {
  return {
    user: { ...authorFixture(), role: 'USER', createdAt: timestamp, verifiedAt: null },
    demoMode: false,
    googleConfigured: true,
    needsOnboarding: false,
  };
}
export function profileFixture(): GameProfile {
  return {
    playerTag: '#GG829JGY',
    name: '플레이어',
    trophies: 7000,
    bestTrophies: 7200,
    arena: '아레나',
    clan: null,
    deck: [{ id: 26000021, name: '호그 라이더', level: 12, iconUrl: 'https://assets.example/hog.png' }],
    verification: 'UNVERIFIED',
    source: 'DEMO',
    fetchedAt: timestamp,
  };
}
export function postFixture(): PostDetail {
  const author = authorFixture();
  return {
    post: {
      viewCount: 0,
      id: 'post-1',
      title: '호그 운영 질문입니다',
      body: '수비 이후 호그를 보내는 타이밍에 관해 알려주세요.',
      categoryId: 'clash-royale',
      category: { id: 'clash-royale', slug: 'clash-royale', name: '클래시로얄', active: true },
      author,
      gameProfile: profileFixture(),
      answerCount: 1,
      helpfulCount: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    answers: [
      {
        id: 'answer-1',
        postId: 'post-1',
        body: '상대 건물이 빠진 다음에 보내보세요.',
        author,
        helpful: false,
        readAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    comments: [],
  };
}
export function messagesFixture(): ChatMessageList {
  const sender = authorFixture();
  const message = {
    id: 'message-1',
    conversationId: 'room-1',
    sender,
    body: '함께 운영을 살펴봐요.',
    createdAt: timestamp,
    clientMessageId: '00000000-0000-4000-8000-000000000001',
  };
  return {
    conversation: {
      id: 'room-1',
      peer: sender,
      lastMessage: message,
      unreadCount: 1,
      updatedAt: timestamp,
      peerLastReadAt: null,
    },
    items: [message],
    nextCursor: null,
  };
}
