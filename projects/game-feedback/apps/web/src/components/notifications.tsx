'use client';
import Link from 'next/link';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { listNotifications, readAllNotifications, readNotification } from '@game-feedback/sdk';
import { useState } from 'react';
import { Bell, CheckCheck, MessageSquare, ThumbsUp, ArrowUpRight, LoaderCircle } from 'lucide-react';
import { useSession, ErrorNotice, LoadingState } from './providers';
import { timeAgo } from '@/lib/api';
export function Notifications({ locale }: { locale: string }) {
  const { session, login } = useSession(),
    queryClient = useQueryClient(),
    [error, setError] = useState(''),
    [pending, setPending] = useState(false);
  const query = useInfiniteQuery({
    queryKey: ['notifications', 'all'],
    queryFn: ({ pageParam }) => listNotifications({ limit: 20, ...(pageParam ? { cursor: pageParam } : {}) }),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor || undefined,
    enabled: !!session?.user,
  });
  async function read(id?: string) {
    setError('');
    setPending(true);
    try {
      if (id) await readNotification(id);
      else await readAllNotifications();
      await queryClient.invalidateQueries({ queryKey: ['notifications'] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  if (!session?.user)
    return (
      <div className="empty-feed">
        <span>
          <Bell size={30} />
        </span>
        <h1>당신의 플레이에 도착한 소식</h1>
        <p>로그인하면 새로운 피드백과 댓글을 확인할 수 있어요.</p>
        <button className="button dark" onClick={login}>
          로그인하고 확인하기
          <ArrowUpRight size={16} />
        </button>
      </div>
    );
  const items = query.data?.pages.flatMap((page) => page.items) || [];
  return (
    <>
      <div className="page-heading">
        <span className="section-eyebrow">YOUR UPDATES</span>
        <h1>새로운 시선이 도착했어요</h1>
        <p>플레이를 함께 고민해 준 사람들의 이야기를 확인하세요.</p>
      </div>
      <div className="section-title-row">
        <h2>
          내 알림<span>{query.data?.pages[0]?.unreadCount || 0}</span>
        </h2>
        <button className="text-button" disabled={pending} onClick={() => read()}>
          <CheckCheck size={16} />
          모두 읽음
        </button>
      </div>
      <ErrorNotice message={error} />
      {query.isPending && <LoadingState />}
      {query.isError && <ErrorNotice message={query.error.message} />}
      {!query.isPending && !items.length && (
        <div className="empty-feed">
          <span>
            <Bell size={28} />
          </span>
          <h3>아직 도착한 소식이 없어요</h3>
          <p>피드백 요청을 남기고 새로운 이야기를 만나보세요.</p>
          <Link href={`/${locale}`} className="button outline">
            라운지 둘러보기
          </Link>
        </div>
      )}
      <div className="notification-list">
        {items.map((item) => (
          <Link
            href={`/${locale}/posts/${item.postId}`}
            key={item.id}
            className={`notification-item ${item.readAt ? '' : 'unread'}`}
            onClick={() => {
              if (!item.readAt) void read(item.id);
            }}
          >
            <span className="notification-type">
              {item.type === 'HELPFUL' ? <ThumbsUp size={22} /> : <MessageSquare size={22} />}
            </span>
            <div>
              <strong>
                {item.type === 'ANSWER'
                  ? '새로운 피드백이 도착했어요'
                  : item.type === 'HELPFUL'
                    ? '당신의 피드백이 도움이 됐어요'
                    : '새로운 댓글이 달렸어요'}
              </strong>
              <p>{item.message}</p>
              <span>{timeAgo(item.createdAt)}</span>
            </div>
            {!item.readAt && <span className="green-dot" />}
            <ArrowUpRight size={17} />
          </Link>
        ))}
      </div>
      {query.hasNextPage && (
        <button
          className="button outline full"
          disabled={query.isFetchingNextPage}
          onClick={() => query.fetchNextPage()}
        >
          {query.isFetchingNextPage && <LoaderCircle className="spin" size={16} />}이전 알림 보기
        </button>
      )}
    </>
  );
}
