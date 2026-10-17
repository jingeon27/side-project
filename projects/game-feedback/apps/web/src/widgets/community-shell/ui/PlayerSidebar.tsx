'use client';
import { useI18n } from '@/shared/i18n';
import { Button } from '@side/design-system';
import { ButtonLink } from '@side/design-system/next';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Trophy, Crown, Settings2, Plus, ArrowUpRight, Shield } from 'lucide-react';
import { useSession } from '@/features/auth';
import { gameAccountListOptions } from '@/features/game-profile';
import { UserBadges } from '@/features/user';
import { Avatar } from '@/shared/ui';
export function PlayerSidebar({ home }: { home: string }) {
  const { t } = useI18n();
  const { session, login: handleLogin } = useSession();
  const { data: accounts } = useQuery(gameAccountListOptions(session?.user?.id));
  return (
    <aside className="right-sidebar">
      <div className="profile-card">
        {session?.user ? (
          <>
            <div className="profile-person">
              <Avatar name={session.user.nickname} size="large" />
              <div>
                <h3>{session.user.nickname}</h3>
                <UserBadges author={session.user} compact />
                <span className="muted small">{t('함께 성장하는 플레이어')}</span>
              </div>
            </div>
            {accounts?.[0] ? (
              <>
                <div className="profile-game">
                  <span>{t('클래시 로얄')}</span>
                  <span className="unverified">{t('소유권 미인증')}</span>
                </div>
                <div className="profile-player-name">
                  {accounts[0].name}
                  <span>{accounts[0].playerTag}</span>
                </div>
                <div className="profile-stats">
                  <div>
                    <Trophy size={16} />
                    <strong>{accounts[0].trophies.toLocaleString()}</strong>
                    <span>{t('트로피')}</span>
                  </div>
                  <div>
                    <Crown size={16} />
                    <strong>{accounts[0].arena}</strong>
                    <span>{t('아레나')}</span>
                  </div>
                </div>
              </>
            ) : (
              <p className="profile-intro">
                {t('게임 프로필을 연결하면 더 구체적인 피드백을 받을 수 있어요.')}
              </p>
            )}
            <ButtonLink
              variant="secondary"
              size="lg"
              fullWidth
              className="button outline full"
              href={`${home}/settings`}
            >
              {accounts?.[0] ? <Settings2 size={16} /> : <Plus size={16} />}
              {accounts?.[0] ? t('내 프로필 관리') : t('게임 프로필 연결')}
            </ButtonLink>
          </>
        ) : (
          <>
            <h3>{t('반가워요, 플레이어님!')}</h3>
            <p className="profile-intro">
              {t('나의 플레이를 나누고')}
              <br />
              {t('새로운 시선을 만나보세요.')}
            </p>
            <Button
              variant="primary"
              size="lg"
              fullWidth
              type="submit"
              className="button primary full"
              onClick={handleLogin}
            >
              {t('함께 시작하기')}
              <ArrowUpRight size={16} />
            </Button>
            <p className="small muted centered">{t('Google 계정으로 간편하게')}</p>
          </>
        )}
      </div>
      <div className="guide-card">
        <h3>
          {t('좋은 질문이')}
          <br />
          {t('좋은 피드백의 시작!')}
        </h3>
        <p>
          {t('사용하는 덱, 고민하는 상황,')}
          <br />
          {t('궁금한 점을 구체적으로 알려주세요.')}
        </p>
        <Link href={`${home}/guide`}>
          {t('피드백 요청 가이드')}
          <ArrowUpRight size={16} />
        </Link>
      </div>
      <div className="community-note">
        <Shield size={17} />
        <div>
          <strong>{t('플레이를 이야기해요, 서로를 존중해요.')}</strong>
          <p>
            {t('비난보다 제안을, 결과보다 과정을.')}
            <br />
            {t('건강한 게임 문화를 함께 만들어요.')}
          </p>
        </div>
      </div>
      <a className="alpha-status" href={`${home}/contact`}>
        <span>{t('지금은 함께 만들어가는 알파 기간')}</span>
        <ArrowUpRight size={13} />
      </a>
      {session?.demoMode && <div className="demo-badge">{t('예시 데이터를 사용하는 데모 환경')}</div>}
    </aside>
  );
}
