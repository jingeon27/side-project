'use client';

import { useMutation, useQueryClient, useSuspenseInfiniteQuery } from '@tanstack/react-query';
import { ArrowUpRight, Bell, CheckCheck } from 'lucide-react';

import { appRoutes } from '@game-feedback/bridge';
import { Button } from '@side/design-system';
import { ButtonLink } from '@side/design-system/next';

import { useSession } from '@/features/auth';
import {
  NotificationItem,
  notificationListOptions,
  notificationPath,
  readNotificationMutationOptions,
} from '@/features/notification';
import { PushNotificationSettings } from '@/features/push-notifications';
import { useI18n } from '@/shared/i18n';
import { AsyncBoundary, ErrorNotice } from '@/shared/ui';
import { CommunityPage } from '@/widgets/community-shell';

import { NotificationsTopbar } from './NotificationsTopbar';

interface INotificationsPageProps {
  locale: string;
}
function NotificationsContent({ locale }: INotificationsPageProps) {
  const { t } = useI18n();
  const { session, login } = useSession();
  if (!session?.user)
    return (
      <div className="empty-feed">
        <span>
          <Bell size={30} />
        </span>
        <h1>{t('당신의 플레이에 도착한 소식')}</h1>
        <p>{t('로그인하면 새로운 피드백과 댓글을 확인할 수 있어요.')}</p>
        <Button variant="primary" size="md" type="button" className="button" onClick={login}>
          {t('로그인하고 확인하기')}
          <ArrowUpRight size={16} />
        </Button>
      </div>
    );
  return (
    <AsyncBoundary clientOnly title={t('내 알림')} resetKey={session.user.id}>
      <NotificationInbox userId={session.user.id} locale={locale} />
    </AsyncBoundary>
  );
}
function NotificationInbox({ userId, locale }: INotificationsPageProps & { userId: string }) {
  const client = useQueryClient();
  const { t } = useI18n();
  const query = useSuspenseInfiniteQuery(notificationListOptions(userId, { limit: 20 }));
  const mutation = useMutation(readNotificationMutationOptions(client));
  if (query.error && !query.isFetching) throw query.error;
  const items = query.data.pages.flatMap((page) => page.items) || [];
  return (
    <>
      <div className="page-heading">
        <h1>{t('새로운 시선이 도착했어요')}</h1>
        <p>{t('플레이를 함께 고민해 준 사람들의 이야기를 확인하세요.')}</p>
      </div>
      <PushNotificationSettings userId={userId} />
      <div className="section-title-row">
        <h2>
          {t('내 알림')}
          <span>{query.data.pages[0]?.unreadCount || 0}</span>
        </h2>
        <button className="text-action" disabled={mutation.isPending} onClick={() => mutation.mutate({})}>
          <CheckCheck size={16} />
          {t('모두 읽음')}
        </button>
      </div>
      <ErrorNotice message={mutation.error && t(mutation.error.message)} />
      {!items.length && (
        <div className="empty-feed">
          <span>
            <Bell size={28} />
          </span>
          <h3>{t('아직 도착한 소식이 없어요')}</h3>
          <p>{t('피드백 요청을 남기고 새로운 이야기를 만나보세요.')}</p>
          <ButtonLink variant="secondary" size="md" href={appRoutes.feed(locale)} className="button">
            {t('피드 둘러보기')}
          </ButtonLink>
        </div>
      )}
      <div className="notification-list">
        {items.map((item) => (
          <NotificationItem
            key={item.id}
            notification={item}
            href={notificationPath(locale, item)}
            onRead={() => mutation.mutate({ id: item.id })}
          />
        ))}
      </div>
      {query.hasNextPage && (
        <Button
          variant="secondary"
          size="lg"
          fullWidth
          type="button"
          className="button"
          loading={query.isFetchingNextPage}
          onClick={() => query.fetchNextPage()}
        >
          {t('이전 알림 보기')}
        </Button>
      )}
    </>
  );
}

export function NotificationsPage(props: Parameters<typeof NotificationsContent>[0]) {
  return (
    <CommunityPage locale={props.locale} topbar={<NotificationsTopbar locale={props.locale} />}>
      <NotificationsContent {...props} />
    </CommunityPage>
  );
}
