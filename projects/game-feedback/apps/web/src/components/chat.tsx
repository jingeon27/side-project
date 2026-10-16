'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import {
  listConversations,
  listChatMessages,
  sendChatMessage,
  readConversation,
  blockUser,
  ApiError,
} from '@game-feedback/sdk';
import type { ChatMessage, Conversation } from '@game-feedback/contracts';
import {
  ArrowLeft,
  ArrowDown,
  ArrowUpRight,
  MessageCircle,
  Send,
  LoaderCircle,
  ShieldBan,
  ShieldCheck,
  Check,
  RefreshCw,
  WifiOff,
} from 'lucide-react';
import { Avatar, ErrorNotice, LoadingState, Modal, useSession } from './providers';
import { useChatConnection } from './chat-realtime';
import { timeAgo } from '@/lib/api';
import { UserBadges } from './user-badges';
function chatError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.errorCode === 'CONVERSATION_NOT_FOUND')
      return '이 대화를 열 수 없어요. 상대가 탈퇴했거나 차단 상태가 바뀌었을 수 있어요.';
    if (error.errorCode === 'RECIPIENT_UNAVAILABLE') return '현재 이 사용자와 대화를 시작할 수 없어요.';
    if (error.errorCode === 'MESSAGE_CONFLICT')
      return '전송 내용이 변경되었어요. 내용을 확인하고 새 메시지로 보내주세요.';
    if (error.errorCode === 'RATE_LIMITED')
      return '메시지를 너무 빠르게 보내고 있어요. 잠시 뒤 다시 시도해 주세요.';
    if (error.errorCode === 'AUTH_REQUIRED') return '로그인이 만료되었어요. 다시 로그인해 주세요.';
    return error.message;
  }
  return '연결을 확인하지 못했어요. 잠시 뒤 다시 시도해 주세요.';
}
export function ChatScreen({ locale, conversationId }: { locale: string; conversationId?: string }) {
  const { session, loading, login } = useSession(),
    connection = useChatConnection(),
    userId = session?.user?.id;
  const conversations = useInfiniteQuery({
    queryKey: ['chat', userId, 'conversations', 'list'],
    queryFn: ({ pageParam }) => listConversations({ limit: 20, ...(pageParam ? { cursor: pageParam } : {}) }),
    initialPageParam: '',
    getNextPageParam: (page) => page.nextCursor || undefined,
    enabled: !!userId,
    refetchInterval: connection === 'live' ? false : 10_000,
    staleTime: 0,
  });
  if (loading) return <LoadingState text="메시지 공간을 준비하고 있어요" />;
  if (!userId)
    return (
      <div className="empty-feed">
        <span>
          <MessageCircle size={30} />
        </span>
        <h1>플레이 이야기를, 조금 더 가까이</h1>
        <p>로그인하면 다른 플레이어와 1:1 메시지를 나눌 수 있어요.</p>
        <button className="button dark" onClick={login}>
          로그인하고 대화하기
          <ArrowUpRight size={16} />
        </button>
      </div>
    );
  const items = conversations.data?.pages.flatMap((page) => page.items) || [],
    unread = conversations.data?.pages[0]?.unreadCount || 0;
  return (
    <>
      <div className="page-heading chat-page-heading">
        <div>
          <span className="section-eyebrow">PLAYER TO PLAYER</span>
          <h1>플레이로 이어지는 대화</h1>
          <p>피드백에서 시작한 이야기를, 1:1 메시지로 이어가세요.</p>
        </div>
        <div className={`chat-connection ${connection}`} role="status">
          {connection === 'live' ? (
            <span className="green-dot" />
          ) : connection === 'offline' ? (
            <WifiOff size={13} />
          ) : (
            <RefreshCw size={12} className="spin" />
          )}
          <span>
            {connection === 'live'
              ? '실시간 연결됨'
              : connection === 'offline'
                ? '오프라인 · 연결을 기다려요'
                : '재연결 중 · 자동으로 새로고침해요'}
          </span>
        </div>
      </div>
      <div className={`chat-workspace ${conversationId ? 'has-conversation' : ''}`}>
        <aside className="conversation-sidebar" aria-label="내 대화 목록">
          <div className="conversation-list-heading">
            <h2>내 메시지</h2>
            {unread > 0 && (
              <span className="chat-unread-total" aria-label={`읽지 않은 메시지 ${unread}개`}>
                {unread}
              </span>
            )}
          </div>
          {conversations.isPending && <LoadingState text="대화를 불러오고 있어요" />}
          {conversations.isError ? (
            <div className="chat-list-error">
              <ErrorNotice message={chatError(conversations.error)} />
              <button className="text-button" onClick={() => conversations.refetch()}>
                <RefreshCw size={13} />
                다시 불러오기
              </button>
            </div>
          ) : (
            <>
              <div className="conversation-list">
                {items.map((item) => (
                  <ConversationRow
                    key={item.id}
                    conversation={item}
                    selected={conversationId === item.id}
                    locale={locale}
                  />
                ))}
              </div>
              {!conversations.isPending && items.length === 0 && (
                <div className="chat-empty-list">
                  <MessageCircle size={27} />
                  <strong>아직 시작한 대화가 없어요</strong>
                  <p>
                    라운지의 요청이나 답변에서
                    <br />
                    ‘채팅하기’를 눌러보세요.
                  </p>
                  <Link href={`/${locale}`}>
                    플레이어 만나러 가기
                    <ArrowUpRight size={13} />
                  </Link>
                </div>
              )}
              {conversations.hasNextPage && (
                <button
                  className="conversation-more"
                  disabled={conversations.isFetchingNextPage}
                  onClick={() => conversations.fetchNextPage()}
                >
                  {conversations.isFetchingNextPage ? '불러오는 중…' : '이전 대화 더 보기'}
                </button>
              )}
            </>
          )}
          <div className="chat-list-note">
            <ShieldCheck size={14} />
            <span>
              대화 상대를 존중하고
              <br />
              개인정보는 공유하지 마세요.
            </span>
          </div>
        </aside>
        {conversationId ? (
          <ConversationPane
            key={`${userId}:${conversationId}`}
            id={conversationId}
            userId={userId}
            locale={locale}
          />
        ) : (
          <section className="chat-welcome">
            <div className="chat-welcome-art">
              <MessageCircle size={43} />
              <span>✳</span>
            </div>
            <span className="section-eyebrow">A NEW PERSPECTIVE, A NEW CONNECTION</span>
            <h2>
              좋은 플레이 뒤에는
              <br />
              좋은 대화가 있어요.
            </h2>
            <p>
              왼쪽에서 대화를 선택하거나,
              <br />
              라운지에서 함께 이야기할 플레이어를 찾아보세요.
            </p>
            <Link href={`/${locale}`} className="button outline">
              피드백 라운지 둘러보기
              <ArrowUpRight size={16} />
            </Link>
          </section>
        )}
      </div>
    </>
  );
}
function ConversationRow({
  conversation,
  selected,
  locale,
}: {
  conversation: Conversation;
  selected: boolean;
  locale: string;
}) {
  return (
    <Link
      href={`/${locale}/messages?conversation=${encodeURIComponent(conversation.id)}`}
      scroll={false}
      className={`conversation-row ${selected ? 'selected' : ''}`}
      data-testid={`conversation-${conversation.id}`}
      aria-label={`${conversation.peer.nickname}님과의 대화${conversation.unreadCount ? `, 읽지 않은 메시지 ${conversation.unreadCount}개` : ''}`}
      aria-current={selected ? 'page' : undefined}
    >
      <Avatar name={conversation.peer.nickname} />
      <div className="conversation-preview">
        <div>
          <strong>{conversation.peer.nickname}</strong>
          <time dateTime={conversation.updatedAt}>{timeAgo(conversation.updatedAt)}</time>
        </div>
        <UserBadges author={conversation.peer} compact />
        <div>
          <p>{conversation.lastMessage?.body || '첫 메시지로 이야기를 시작해요'}</p>
          {conversation.unreadCount > 0 && (
            <span className="chat-unread-count">
              {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
function ConversationPane({ id, userId, locale }: { id: string; userId: string; locale: string }) {
  const connection = useChatConnection(),
    client = useQueryClient(),
    router = useRouter(),
    { notify } = useSession();
  const query = useInfiniteQuery({
    queryKey: ['chat', userId, 'messages', id],
    queryFn: ({ pageParam }) =>
      listChatMessages(id, { limit: 30, ...(pageParam ? { cursor: pageParam } : {}) }),
    initialPageParam: '',
    getNextPageParam: (page) => page.nextCursor || undefined,
    refetchInterval: connection === 'live' ? false : 10_000,
    staleTime: 0,
    retry: (count, error) =>
      !(error instanceof ApiError && [401, 403, 404].includes(error.status)) && count < 1,
  });
  const [draft, setDraft] = useState(''),
    [sending, setSending] = useState(false),
    [sendError, setSendError] = useState(''),
    [readError, setReadError] = useState(''),
    [unseen, setUnseen] = useState(false),
    [blocking, setBlocking] = useState(false),
    [blockError, setBlockError] = useState(''),
    [blockPending, setBlockPending] = useState(false);
  const [visibleBoundary, setVisibleBoundary] = useState(''),
    [active, setActive] = useState(true),
    [readRetry, setReadRetry] = useState(0);
  const pendingMessage = useRef<{ body: string; clientMessageId: string } | null>(null),
    scroller = useRef<HTMLDivElement>(null),
    initialized = useRef(false),
    nearBottom = useRef(true),
    forceBottom = useRef(false),
    lastNewest = useRef(''),
    historyAnchor = useRef<{ height: number; top: number } | null>(null),
    lastRead = useRef('');
  const conversation = query.data?.pages[0]?.conversation;
  const newestFirst = query.data?.pages.flatMap((page) => page.items) || [],
    unique = new Map(newestFirst.map((message) => [message.id, message]));
  const messages = [...unique.values()].reverse(),
    messageStamp = messages.map((message) => message.id).join(','),
    newestId = newestFirst[0]?.id || '';
  useEffect(() => {
    const update = () => setActive(document.visibilityState === 'visible');
    update();
    document.addEventListener('visibilitychange', update);
    window.addEventListener('focus', update);
    return () => {
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('focus', update);
    };
  }, []);
  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element || query.isPending || query.isError) return;
    if (historyAnchor.current) {
      if (!query.isFetchingNextPage) {
        element.scrollTop = element.scrollHeight - historyAnchor.current.height + historyAnchor.current.top;
        historyAnchor.current = null;
      }
      return;
    }
    if (!initialized.current || forceBottom.current || nearBottom.current) {
      element.scrollTop = element.scrollHeight;
      initialized.current = true;
      forceBottom.current = false;
      setUnseen(false);
    } else if (newestId !== lastNewest.current) setUnseen(true);
    lastNewest.current = newestId;
  }, [messageStamp, newestId, query.isPending, query.isError, query.isFetchingNextPage]);
  useEffect(() => {
    const element = scroller.current;
    if (!element || query.isError) return;
    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const node = entry.target as HTMLElement,
            messageId = node.dataset.messageId;
          if (!messageId) continue;
          if (entry.isIntersecting) visible.set(messageId, Number(node.dataset.messageIndex));
          else visible.delete(messageId);
        }
        const boundary = [...visible.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
        if (boundary) setVisibleBoundary(boundary);
      },
      { root: element, threshold: 0.1 },
    );
    for (const node of element.querySelectorAll('[data-message-id]')) observer.observe(node);
    return () => observer.disconnect();
  }, [messageStamp, query.isError]);
  useEffect(() => {
    if (!active || !visibleBoundary || query.isError || lastRead.current === visibleBoundary) return;
    let disposed = false;
    lastRead.current = visibleBoundary;
    readConversation(id, { messageId: visibleBoundary })
      .then(() => {
        if (!disposed) {
          setReadError('');
          void client.invalidateQueries({ queryKey: ['chat', userId, 'conversations'] });
        }
      })
      .catch((error) => {
        if (!disposed) {
          lastRead.current = '';
          setReadError(chatError(error));
        }
      });
    return () => {
      disposed = true;
    };
  }, [active, visibleBoundary, id, userId, client, query.isError, readRetry]);
  async function send(event?: FormEvent) {
    event?.preventDefault();
    const body = draft.trim();
    if (!body || body.length > 2000 || sending || query.isError) return;
    setSending(true);
    setSendError('');
    if (pendingMessage.current?.body !== body)
      pendingMessage.current = { body, clientMessageId: crypto.randomUUID() };
    try {
      await sendChatMessage(id, pendingMessage.current);
      pendingMessage.current = null;
      setDraft('');
      forceBottom.current = true;
      await Promise.all([
        client.invalidateQueries({ queryKey: ['chat', userId, 'messages', id] }),
        client.invalidateQueries({ queryKey: ['chat', userId, 'conversations'] }),
      ]);
    } catch (error) {
      setSendError(chatError(error));
      if (error instanceof ApiError && [401, 403, 404].includes(error.status)) await query.refetch();
    } finally {
      setSending(false);
    }
  }
  async function loadOlder() {
    if (!scroller.current) return;
    historyAnchor.current = { height: scroller.current.scrollHeight, top: scroller.current.scrollTop };
    await query.fetchNextPage();
  }
  async function block() {
    if (!conversation) return;
    setBlockPending(true);
    setBlockError('');
    try {
      await blockUser({ blockedUserId: conversation.peer.id });
      client.removeQueries({ queryKey: ['chat', userId, 'messages', id] });
      await Promise.all([
        client.invalidateQueries({ queryKey: ['chat', userId, 'conversations'] }),
        client.invalidateQueries({ queryKey: ['blocks'] }),
        client.invalidateQueries({ queryKey: ['posts'] }),
      ]);
      setBlocking(false);
      router.replace(`/${locale}/messages`, { scroll: false });
      notify('사용자를 차단했어요. 더 이상 메시지를 주고받을 수 없어요.');
    } catch (error) {
      setBlockError(chatError(error));
    } finally {
      setBlockPending(false);
    }
  }
  function scrollToLatest() {
    const element = scroller.current;
    if (element) {
      element.scrollTop = element.scrollHeight;
      nearBottom.current = true;
      setUnseen(false);
    }
  }
  if (query.isPending)
    return (
      <section className="conversation-pane">
        <LoadingState text="메시지를 불러오고 있어요" />
      </section>
    );
  if (query.isError || !conversation)
    return (
      <section className="conversation-pane chat-unavailable">
        <ShieldBan size={32} />
        <h2>지금은 이 대화를 열 수 없어요</h2>
        <ErrorNotice message={chatError(query.error)} />
        <button className="button outline" onClick={() => query.refetch()}>
          <RefreshCw size={15} />
          다시 확인
        </button>
        <Link className="text-button" href={`/${locale}/messages`}>
          대화 목록으로 돌아가기 →
        </Link>
      </section>
    );
  return (
    <section className="conversation-pane" aria-label={`${conversation.peer.nickname}님과의 대화`}>
      <header className="conversation-heading">
        <Link
          href={`/${locale}/messages`}
          scroll={false}
          className="icon-button chat-back"
          aria-label="대화 목록으로 돌아가기"
        >
          <ArrowLeft size={19} />
        </Link>
        <Avatar name={conversation.peer.nickname} />
        <div>
          <h2>{conversation.peer.nickname}</h2>
          <UserBadges author={conversation.peer} compact />
          <p>플레이어와 나누는 1:1 대화</p>
        </div>
        <button
          className="text-button"
          onClick={() => {
            setBlockError('');
            setBlocking(true);
          }}
        >
          <ShieldBan size={13} />
          차단
        </button>
      </header>
      <div
        className="chat-message-scroll"
        ref={scroller}
        role="log"
        aria-label="대화 메시지"
        aria-live="polite"
        aria-relevant="additions"
        onScroll={() => {
          const node = scroller.current;
          if (!node) return;
          nearBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 90;
          if (nearBottom.current) setUnseen(false);
        }}
      >
        {query.hasNextPage && (
          <button className="chat-older" disabled={query.isFetchingNextPage} onClick={loadOlder}>
            {query.isFetchingNextPage ? <LoaderCircle className="spin" size={13} /> : <RefreshCw size={12} />}
            이전 메시지 불러오기
          </button>
        )}
        {!query.hasNextPage && (
          <div className="chat-beginning">
            <ShieldCheck size={14} />
            <span>대화의 시작이에요. 먼저 가볍게 인사해보세요.</span>
          </div>
        )}
        {messages.map((message, index) => {
          const mine = message.sender.id === userId,
            previous = messages[index - 1],
            day = new Date(message.createdAt).toLocaleDateString('ko-KR', {
              month: 'long',
              day: 'numeric',
              weekday: 'short',
            });
          return (
            <div key={message.id}>
              {(!previous ||
                new Date(previous.createdAt).toDateString() !==
                  new Date(message.createdAt).toDateString()) && (
                <div className="chat-date">
                  <span>{day}</span>
                </div>
              )}
              <MessageBubble
                message={message}
                mine={mine}
                index={index}
                peerLastReadAt={conversation.peerLastReadAt}
              />
            </div>
          );
        })}
        {messages.length === 0 && (
          <div className="conversation-first-message">
            <MessageCircle size={33} />
            <strong>{conversation.peer.nickname}님과 이야기를 시작해요</strong>
            <p>
              어떤 플레이가 기억에 남았나요?
              <br />
              먼저 반가운 인사를 건네보세요.
            </p>
          </div>
        )}
      </div>
      {unseen && (
        <button className="chat-new-messages" onClick={scrollToLatest}>
          새 메시지가 도착했어요
          <ArrowDown size={14} />
        </button>
      )}
      <div className="chat-compose-area">
        {readError && (
          <div className="chat-read-error">
            <span>읽음 상태를 동기화하지 못했어요.</span>
            <button className="text-button" onClick={() => setReadRetry((value) => value + 1)}>
              다시 시도
            </button>
          </div>
        )}
        {sendError && (
          <div className="chat-send-error" role="alert">
            {sendError}
            <span>작성한 내용은 그대로 남아 있어요.</span>
          </div>
        )}
        <form className="chat-compose" onSubmit={send}>
          <textarea
            aria-label="메시지 내용"
            placeholder="플레이 이야기를 나눠보세요"
            rows={2}
            maxLength={2000}
            value={draft}
            disabled={sending}
            onChange={(event) => {
              setDraft(event.target.value);
              if (sendError) setSendError('');
            }}
            onKeyDown={(event) => {
              if (
                event.key === 'Enter' &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing &&
                event.nativeEvent.keyCode !== 229
              ) {
                event.preventDefault();
                void send();
              }
            }}
          />
          <button
            className="button dark"
            type="submit"
            disabled={sending || !draft.trim()}
            aria-label={sendError ? '다시 보내기' : '보내기'}
          >
            {sending ? <LoaderCircle className="spin" size={17} /> : <Send size={17} />}
          </button>
        </form>
        <div className="chat-compose-hint">
          <span>Enter로 보내기 · Shift + Enter로 줄바꿈</span>
          <span>{draft.length.toLocaleString()} / 2,000</span>
        </div>
      </div>
      <Modal
        open={blocking}
        onOpenChange={setBlocking}
        title={`${conversation.peer.nickname}님을 차단할까요?`}
        description="서로의 게시글과 대화가 숨겨지며 메시지를 더 이상 주고받을 수 없어요. 설정에서 차단을 해제할 수 있습니다."
      >
        <div className="form-stack">
          <ErrorNotice message={blockError} />
          <button className="button danger full" disabled={blockPending} onClick={block}>
            {blockPending ? <LoaderCircle className="spin" size={16} /> : <ShieldBan size={16} />}차단하기
          </button>
          <button className="button outline full" onClick={() => setBlocking(false)}>
            돌아가기
          </button>
        </div>
      </Modal>
    </section>
  );
}
function MessageBubble({
  message,
  mine,
  index,
  peerLastReadAt,
}: {
  message: ChatMessage;
  mine: boolean;
  index: number;
  peerLastReadAt: string | null;
}) {
  const read =
    mine && !!peerLastReadAt && new Date(message.createdAt).getTime() <= new Date(peerLastReadAt).getTime();
  return (
    <div
      className={`chat-message ${mine ? 'mine' : 'theirs'}`}
      data-testid={`message-${message.id}`}
      data-message-id={message.id}
      data-message-index={index}
    >
      {!mine && <Avatar name={message.sender.nickname} size="small" />}
      <div className="chat-message-content">
        <p className="chat-bubble">{message.body}</p>
        <div className="chat-message-meta">
          <time dateTime={message.createdAt}>
            {new Date(message.createdAt).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })}
          </time>
          {mine && (
            <span className={read ? 'message-read' : ''}>
              {read ? (
                <>
                  <Check size={10} />
                  읽음
                </>
              ) : (
                '전송됨'
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
