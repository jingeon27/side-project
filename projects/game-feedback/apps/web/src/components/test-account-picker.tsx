'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, LoaderCircle, FlaskConical, ShieldCheck } from 'lucide-react';
import { listTestAccounts, testAccountLogin } from '@game-feedback/sdk';
import { Avatar, ErrorNotice, useSession } from './providers';
import { UserBadges } from './user-badges';
import { replaceSession } from '@/lib/session-cache';
export function TestAccountPicker({
  onSuccess,
  mode = 'login',
}: {
  onSuccess?: () => void;
  mode?: 'login' | 'switch';
}) {
  const { session, notify } = useSession(),
    client = useQueryClient(),
    [pending, setPending] = useState(''),
    [error, setError] = useState('');
  const accounts = useQuery({
    queryKey: ['test-accounts'],
    queryFn: () => listTestAccounts(),
    enabled: !!session?.demoMode,
    retry: false,
  });
  if (!session?.demoMode) return null;
  async function choose(accountId: string) {
    setPending(accountId);
    setError('');
    try {
      const next = await testAccountLogin({ accountId });
      await replaceSession(client, next);
      onSuccess?.();
      notify(`${next.user?.nickname || '테스트 계정'} 계정으로 시작했어요.`);
    } catch (error) {
      setError((error as Error).message || '테스트 계정에 연결하지 못했어요.');
    } finally {
      setPending('');
    }
  }
  return (
    <div className={`test-account-picker test-account-picker-${mode}`}>
      <div className="test-picker-heading">
        <FlaskConical size={17} />
        <div>
          <strong>{mode === 'switch' ? '테스트 계정 전환' : '로그인 없이 바로 체험해보세요'}</strong>
          <span>플레이어 · 인증 코치 · 운영자 계정이 준비되어 있어요</span>
        </div>
      </div>
      <p className="test-account-notice">
        공용 테스트 계정입니다. 글·댓글·채팅이 다른 테스트 이용자와 공유되니 개인정보는 입력하지 마세요.
      </p>
      {accounts.isPending && (
        <div className="test-account-loading">
          <LoaderCircle className="spin" size={16} />
          계정을 준비하고 있어요
        </div>
      )}
      {accounts.isError && (
        <>
          <ErrorNotice message="테스트 계정을 불러오지 못했어요." />
          <button className="text-button" onClick={() => accounts.refetch()}>
            다시 불러오기
          </button>
        </>
      )}
      <div className="test-account-options">
        {accounts.data?.items.map((account) => {
          const current = session.user?.id === account.id,
            label =
              account.role === 'ADMIN'
                ? '운영자 테스트로 시작'
                : account.isVerified
                  ? '인증 코치로 시작'
                  : '테스트 플레이어로 시작';
          return (
            <button
              className={`test-account-option ${current ? 'current' : ''}`}
              key={account.id}
              disabled={!!pending || current}
              aria-label={`${account.nickname} · ${label}`}
              onClick={() => choose(account.id)}
            >
              <Avatar name={account.nickname} />
              <span className="test-account-option-content">
                <span className="test-account-title">
                  <strong>{account.nickname}</strong>
                  {account.role === 'ADMIN' && (
                    <span className="test-admin-role">
                      <ShieldCheck size={10} />
                      운영자
                    </span>
                  )}
                </span>
                <UserBadges author={account} compact />
                <span className="test-account-description">{account.description}</span>
                <span className="test-account-action">{current ? '현재 사용 중인 계정' : label}</span>
              </span>
              {pending === account.id ? (
                <LoaderCircle className="spin" size={16} />
              ) : !current ? (
                <ArrowUpRight size={16} />
              ) : null}
            </button>
          );
        })}
      </div>
      <ErrorNotice message={error} />
    </div>
  );
}
