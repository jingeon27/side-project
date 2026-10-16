'use client';
import Link from 'next/link';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Bell, CheckCheck, ArrowUpRight, LoaderCircle } from 'lucide-react';
import { useSession } from '@/features/auth';
import {
  notificationListOptions,
  NotificationItem,
  useReadNotificationMutation,
} from '@/features/notification';
import { ErrorNotice, LoadingState } from '@/shared/ui';
interface INotificationsPageProps {
  locale: string;
}
export function NotificationsPage({ locale }: INotificationsPageProps) {
  const { session, login, loading } = useSession(),
    query = useInfiniteQuery(notificationListOptions(session?.user?.id, { limit: 20 })),
    mutation = useReadNotificationMutation();
  if (loading) return <LoadingState />;
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
        <button className="text-button" disabled={mutation.isPending} onClick={() => mutation.mutate({})}>
          <CheckCheck size={16} />
          모두 읽음
        </button>
      </div>
      <ErrorNotice message={mutation.error?.message} />
      {query.isPending && <LoadingState />}
      {query.isError && <ErrorNotice message={query.error.message} />}
      {!query.isPending && !query.isError && !items.length && (
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
      {!query.isError && (
        <div className="notification-list">
          {items.map((item) => (
            <NotificationItem
              key={item.id}
              notification={item}
              href={`/${locale}/posts/${item.postId}`}
              onRead={() => mutation.mutate({ id: item.id })}
            />
          ))}
        </div>
      )}
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
