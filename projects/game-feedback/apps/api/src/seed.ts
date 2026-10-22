import { conversationPair } from './chat/conversation-pair';
import { Prisma, PrismaClient } from './generated/prisma';
import { assertDatabaseUrl, DemoProfileProvider } from './security';
import { seedCommunityPosts } from './testing/community-fixtures';

export const TEST_ACCOUNT_FIXTURES = [
  {
    id: 'sample-user-0',
    demoKey: 'sample:0',
    nickname: '새벽의호그',
    role: 'USER',
    isVerified: false,
    supercellTag: '#GG829JGY',
    description: '게시글을 작성하고 피드백을 확인하는 요청자 계정',
  },
  {
    id: 'sample-user-3',
    demoKey: 'sample:3',
    nickname: '덱연구소',
    role: 'USER',
    isVerified: true,
    supercellTag: '#9QY82JGY',
    description: '서비스 인증 배지와 피드백·채팅을 확인하는 코치 계정',
  },
  {
    id: 'sample-test-admin',
    demoKey: 'sample:admin',
    nickname: '운영테스터',
    role: 'ADMIN',
    isVerified: false,
    supercellTag: null,
    description: '신고·콘텐츠 숨김·서비스 인증 관리를 확인하는 운영자 계정',
  },
] as const;

export async function seed(db: PrismaClient, demoMode = false) {
  await db.category.upsert({
    where: { slug: 'clash-royale' },
    update: {},
    create: { id: 'clash-royale', slug: 'clash-royale', name: '클래시로얄' },
  });
  if (!demoMode) return;
  if (process.env.NODE_ENV === 'production') throw new Error('Sample data is forbidden in production.');
  const category = await db.category.findUniqueOrThrow({ where: { slug: 'clash-royale' } });
  const names = ['새벽의호그', '아레나산책', '메가나이트', '덱연구소', '로얄메이트', '느긋한라바'];
  const authors = [];
  for (const [i, nickname] of names.entries()) {
    const fixture = TEST_ACCOUNT_FIXTURES.find((account) => account.id === `sample-user-${i}`);
    authors.push(
      await db.user.upsert({
        where: { demoKey: `sample:${i}` },
        update: {},
        create: {
          id: `sample-user-${i}`,
          demoKey: `sample:${i}`,
          nickname,
          termsVersion: 'demo',
          ageConfirmed: true,
          isVerified: fixture?.isVerified ?? false,
          verifiedAt: fixture?.isVerified ? new Date() : null,
          supercellTag: fixture?.supercellTag ?? null,
        },
      }),
    );
  }
  const [requester, , , coach] = authors;
  if (!requester || !coach) throw new Error('Sample requester and coach accounts are required.');
  const admin = TEST_ACCOUNT_FIXTURES[2];
  await db.user.upsert({
    where: { demoKey: admin.demoKey },
    update: {},
    create: {
      id: admin.id,
      demoKey: admin.demoKey,
      nickname: admin.nickname,
      role: admin.role,
      isVerified: false,
      termsVersion: 'demo',
      ageConfirmed: true,
    },
  });
  // The saved account follows each fixture's current tag; startup never replaces user edits.
  for (const author of [requester, coach]) {
    if (!author.supercellTag) continue;
    const accountProfile = await new DemoProfileProvider().lookup(author.supercellTag);
    await db.gameAccount.upsert({
      where: { userId_playerTag: { userId: author.id, playerTag: author.supercellTag } },
      update: {},
      create: {
        userId: author.id,
        playerTag: author.supercellTag,
        profile: accountProfile as unknown as Prisma.InputJsonValue,
      },
    });
  }
  const entries: [title: string, body: string][] = [
    [
      '호그 2.6으로 메가나이트를 막는 타이밍이 궁금해요',
      '6800점 구간에서 호그 2.6 덱을 쓰고 있어요. 상대가 메가나이트를 다리 뒤에 놓으면 얼음 골렘으로 유도해도 머스킷병이 자주 잡혀요. 대포를 놓는 위치와 엘릭서 운영을 어떻게 바꾸면 좋을까요?',
    ],
    [
      '첫 그랜드 챌린지, 광부 독 덱 운영 피드백 부탁드려요',
      '광부 독 컨트롤을 연습 중인데 수비 이후 공격을 이어가는 타이밍을 잘 모르겠어요. 독을 아껴야 할지 타워와 함께 맞추는 게 좋을지, 실전에서 판단하는 기준이 궁금합니다.',
    ],
    [
      '로얄 자이언트 덱, 마지막 한 자리를 바꾸고 싶어요',
      '로얄 자이언트와 낚시꾼을 중심으로 플레이하고 있어요. 최근 공중 덱을 자주 만나서 수비가 버거운데, 어떤 카드를 바꾸면 밸런스를 맞출 수 있을까요? 현재 덱과 트로피를 함께 올려요.',
    ],
    [
      '7000점 도전 중! 더블 엘릭서 운영이 어려워요',
      '싱글 엘릭서에서는 수비가 잘 되는데 더블 엘릭서가 시작되면 덱 순환이 꼬여요. 상대 공격에 계속 반응하다 보니 제 공격 타이밍이 없어집니다. 흐름을 바꾸는 방법을 알려주세요.',
    ],
    [
      '페카 브릿지 스팸 vs 라바, 어떻게 운영하시나요?',
      '페카 브릿지 스팸 덱으로 라바를 만나면 반대쪽을 밀어야 한다는 건 알지만 매번 타워 교환에서 손해를 봐요. 공격과 수비에 쓸 엘릭서를 나누는 기준을 듣고 싶어요.',
    ],
    [
      '복귀 유저입니다. 지금 덱으로 다시 시작해도 될까요?',
      '오랜만에 복귀해서 익숙한 라바 덱으로 플레이하고 있어요. 달라진 카드와 수비 패턴에 적응하는 중인데 먼저 연습하면 좋은 운영이나 덱 조합을 추천해주세요.',
    ],
  ];
  for (const [i, [title, body]] of entries.entries()) {
    const author = authors[i];
    if (!author) throw new Error(`Sample post ${i} needs a sample author.`);
    await db.post.upsert({
      where: { id: `sample-post-${i}` },
      update: {},
      create: {
        id: `sample-post-${i}`,
        authorId: author.id,
        categoryId: category.id,
        title,
        body,
        createdAt: new Date(Date.now() - (i + 1) * 1000 * 60 * 37),
      },
    });
  }
  await seedCommunityPosts(
    db,
    category.id,
    authors.map((author) => author.id),
  );
  await db.answer.upsert({
    where: { id: 'sample-answer-0' },
    update: {},
    create: {
      id: 'sample-answer-0',
      postId: 'sample-post-0',
      authorId: coach.id,
      body: '메가나이트가 점프하기 전에 얼음 골렘을 중앙으로 이동시켜 보세요. 대포는 강에서 네 칸 아래, 중앙에 두면 양쪽 프린세스 타워의 도움을 받을 수 있어요. 머스킷병은 대포와 거리를 벌리고, 상대가 메가나이트에 엘릭서를 쓴 직후 반대편 호그로 압박해 보세요.',
      helpful: true,
    },
  });
  await db.answer.upsert({
    where: { id: 'sample-answer-2' },
    update: {},
    create: {
      id: 'sample-answer-2',
      postId: 'sample-post-2',
      authorId: requester.id,
      body: '공중 대응이 부족하다면 피닉스나 사냥꾼을 고려해 보세요. 낚시꾼으로 탱커를 중앙으로 끌어오고 사냥꾼을 가까이 배치하면 한 번에 큰 피해를 줄 수 있습니다. 먼저 친선전에서 새로운 조합을 연습해 보세요.',
    },
  });
  await db.comment.upsert({
    where: { id: 'sample-comment-0' },
    update: {},
    create: {
      id: 'sample-comment-0',
      postId: 'sample-post-0',
      authorId: coach.id,
      body: '메가나이트가 점프하기 직전의 배치를 채팅으로 함께 살펴봐요.',
    },
  });
  await db.comment.upsert({
    where: { id: 'sample-comment-1' },
    update: {},
    create: {
      id: 'sample-comment-1',
      postId: 'sample-post-0',
      authorId: requester.id,
      body: '감사합니다! 대포 위치를 바꿔보고 채팅으로 질문드릴게요.',
    },
  });
  const { firstUserId, secondUserId } = conversationPair(requester.id, coach.id);
  const conversation = await db.chatConversation.upsert({
    where: { firstUserId_secondUserId: { firstUserId, secondUserId } },
    update: {},
    create: {
      id: 'sample-conversation-0-3',
      firstUserId,
      secondUserId,
      updatedAt: new Date(Date.now() - 1000 * 60 * 19),
    },
  });
  const sampleMessages = [
    {
      id: 'sample-chat-message-0',
      senderId: requester.id,
      clientMessageId: '00000000-0000-4000-8000-000000000001',
      body: '안녕하세요! 호그 덱 피드백을 보고 수비 위치를 더 질문하고 싶어요.',
    },
    {
      id: 'sample-chat-message-1',
      senderId: coach.id,
      clientMessageId: '00000000-0000-4000-8000-000000000002',
      body: '반가워요. 대포를 중앙에 두고 얼음 골렘으로 유도하는 상황부터 같이 살펴봐요.',
    },
  ];
  for (const [i, message] of sampleMessages.entries()) {
    await db.chatMessage.upsert({
      where: {
        senderId_clientMessageId: { senderId: message.senderId, clientMessageId: message.clientMessageId },
      },
      update: {},
      create: {
        ...message,
        conversationId: conversation.id,
        createdAt: new Date(Date.now() - 1000 * 60 * (20 - i)),
      },
    });
  }
}
if (require.main === module) {
  const db = new PrismaClient({ datasources: { db: { url: assertDatabaseUrl(process.env.DATABASE_URL) } } });
  seed(db, process.env.GF_DEMO_MODE === 'true' || process.env.GF_TEST_AUTH_ENABLED === 'true')
    .then(() => console.log('Game Feedback seed complete (existing content preserved).'))
    .finally(() => db.$disconnect())
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
