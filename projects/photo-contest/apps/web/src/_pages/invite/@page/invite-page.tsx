'use client';
import { useMutation, useQuery } from '@apollo/client/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { JoinGroupDocument, MeDocument } from '@/shared/api/generated';
import { Login } from '@/features/auth/login';
import { Button } from '@/shared/ui/button';
import { ErrorNotice, LoadingState } from '@/shared/ui/states';
import { errorMessage } from '@/shared/lib/format';
export function InvitePage({ token }: { token: string }) {
  const me = useQuery(MeDocument);
  const [join, { loading }] = useMutation(JoinGroupDocument);
  const [error, setError] = useState('');
  const router = useRouter();
  async function handleJoin() {
    setError('');
    try {
      const { data } = await join({ variables: { token } });
      if (data) router.push(`/groups/${data.joinGroup.id}`);
    } catch (error) {
      setError(errorMessage(error));
    }
  }
  if (me.loading) return <LoadingState />;
  if (me.error)
    return (
      <ErrorNotice
        retry={() => {
          void me.refetch();
        }}
      />
    );
  return (
    <section className="invite-page">
      <span className="invite-emoji" aria-hidden>
        💌
      </span>
      <span className="eyebrow">YOU’RE INVITED</span>
      <h1>우리 그룹에 놀러 와요.</h1>
      <p className="muted">친구들과 사진 한 장으로 시작하는 작은 대회.</p>
      {!me.data?.me ? (
        <Login />
      ) : (
        <>
          <Button disabled={loading} onClick={handleJoin}>
            {loading ? '가입하는 중…' : '초대 수락하고 가입하기'}
          </Button>
          {error && <ErrorNotice message={error} />}
        </>
      )}
    </section>
  );
}
