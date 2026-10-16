'use client';
import { getSession } from '@game-feedback/sdk';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Check, ArrowRight, LoaderCircle, ShieldCheck, Gamepad2 } from 'lucide-react';
import { api, json, type Session } from '@/lib/api';
import { ChatRealtimeProvider } from './chat-realtime';
import { TestAccountPicker } from './test-account-picker';
import { replaceSession } from '@/lib/session-cache';
const SessionContext = createContext<{
  session: Session | undefined;
  loading: boolean;
  login: () => void;
  notify: (text: string) => void;
}>({ session: undefined, loading: true, login: () => {}, notify: () => {} });
export function useSession() {
  return useContext(SessionContext);
}
export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: true } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <SessionProvider>{children}</SessionProvider>
    </QueryClientProvider>
  );
}
function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data: session, isPending } = useQuery({ queryKey: ['session'], queryFn: () => getSession() });
  const [loginOpen, setLoginOpen] = useState(false),
    [toast, setToast] = useState('');
  const notify = useCallback((text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(''), 4500);
  }, []);
  return (
    <SessionContext.Provider value={{ session, loading: isPending, login: () => setLoginOpen(true), notify }}>
      <ChatRealtimeProvider key={session?.user?.id || 'anonymous'} userId={session?.user?.id}>
        {children}
      </ChatRealtimeProvider>
      <LoginDialog
        open={loginOpen || !!session?.needsOnboarding}
        onOpenChange={setLoginOpen}
        session={session}
        onSuccess={() => setLoginOpen(false)}
      />
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
          <button className="icon-button" aria-label="알림 닫기" onClick={() => setToast('')}>
            <X size={16} />
          </button>
        </div>
      )}
    </SessionContext.Provider>
  );
}
function LoginDialog({
  open,
  onOpenChange,
  session,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session?: Session;
  onSuccess: () => void;
}) {
  const client = useQueryClient(),
    { notify } = useSession();
  const [nickname, setNickname] = useState(''),
    [agreed, setAgreed] = useState(false),
    [age, setAge] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState('');
  async function join(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      const next = await api<Session>(
        session?.needsOnboarding ? '/auth/onboard' : '/auth/demo',
        json(
          'POST',
          session?.needsOnboarding
            ? { nickname: nickname.trim(), acceptedTerms: agreed, ageConfirmed: age }
            : { nickname: nickname.trim() },
        ),
      );
      await replaceSession(client, next);
      onSuccess();
      notify('반가워요! 함께 플레이를 나눠봐요.');
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setPending(false);
    }
  }
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={
        session?.needsOnboarding
          ? '어떤 이름으로 만날까요?'
          : session?.demoMode
            ? '함께 플레이할 계정을 골라보세요'
            : '다음 플레이는 함께, 더 좋게'
      }
      description="플레이메이트에 오신 것을 환영해요."
    >
      {session?.demoMode && !session.needsOnboarding ? (
        <TestAccountPicker onSuccess={onSuccess} />
      ) : (
        <div className="login-icon">
          <Gamepad2 size={34} />
        </div>
      )}
      {!session?.needsOnboarding && (
        <>
          <a
            className={`button google-button ${session && !session.googleConfigured ? 'disabled-link' : ''}`}
            href="/api/auth/google"
          >
            <span className="google-letter">G</span>Google로 시작하기
            <ArrowRight size={17} />
          </a>
          <p className="muted small">
            {session && !session.googleConfigured
              ? 'Google 로그인 연결 준비 중 · 데모로 먼저 둘러보세요.'
              : 'Google의 공개 이름과 사진은 수집하지 않아요.'}
          </p>
        </>
      )}
      {(session?.demoMode || session?.needsOnboarding) && (
        <form onSubmit={join} className="form-stack">
          {session?.demoMode && !session.needsOnboarding && (
            <div className="custom-demo-divider">
              <span>직접 정한 닉네임으로 시작하기</span>
            </div>
          )}
          <Field label="서비스 닉네임">
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              minLength={2}
              maxLength={20}
              required
              placeholder="2~20자로 입력해 주세요"
              autoComplete="nickname"
            />
          </Field>
          <label className="check-row">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} required />
            <span>
              <a href="/ko/terms" target="_blank">
                이용약관
              </a>{' '}
              및{' '}
              <a href="/ko/privacy" target="_blank">
                개인정보 처리방침
              </a>
              에 동의합니다.
            </span>
          </label>
          <label className="check-row">
            <input type="checkbox" checked={age} onChange={(e) => setAge(e.target.checked)} required />
            <span>만 14세 이상입니다.</span>
          </label>
          <ErrorNotice message={error} />
          <button className="button primary full" disabled={pending || !agreed || !age}>
            {pending ? <LoaderCircle className="spin" size={18} /> : <ArrowRight size={18} />}
            {session?.needsOnboarding ? '가입 완료하기' : '데모로 시작하기'}
          </button>
        </form>
      )}
      <p className="login-footer">
        <ShieldCheck size={14} />
        서로를 존중하는 건강한 피드백 공간
      </p>
    </Modal>
  );
}
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content">
          <div className="dialog-heading">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close className="icon-button" aria-label="닫기">
              <X size={20} />
            </Dialog.Close>
          </div>
          <Dialog.Description className="dialog-description">{description}</Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function ErrorNotice({ message }: { message?: string }) {
  return message ? (
    <div role="alert" className="error-notice">
      {message}
    </div>
  ) : null;
}
export function LoadingState({ text = '불러오고 있어요' }: { text?: string }) {
  return (
    <div className="state-box">
      <LoaderCircle size={24} className="spin" />
      <p>{text}</p>
    </div>
  );
}
export function Avatar({ name, size = 'normal' }: { name: string; size?: 'small' | 'normal' | 'large' }) {
  return (
    <span className={`avatar avatar-${size}`} aria-hidden="true">
      {name.slice(0, 1)}
    </span>
  );
}
