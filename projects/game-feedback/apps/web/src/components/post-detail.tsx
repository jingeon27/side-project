'use client';
import Link from 'next/link';
import { getPost } from '@game-feedback/sdk';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  MessageSquare,
  Check,
  ThumbsUp,
  Send,
  Flag,
  Pencil,
  Trash2,
  ShieldBan,
  LoaderCircle,
  ArrowUpRight,
  Eye,
} from 'lucide-react';
import {
  api,
  json,
  timeAgo,
  type PostDetail as Detail,
  type Answer,
  type Comment,
  type Author,
} from '@/lib/api';
import { Avatar, Modal, Field, ErrorNotice, LoadingState, useSession } from './providers';
import { ProfileSnapshot } from './game-profile';
import { PostComposer } from './post-composer';
import { ChatLink } from './chat-link';
import { UserBadges } from './user-badges';
type Target = { type: 'POST' | 'ANSWER' | 'COMMENT'; id: string; author: Author };
export function PostDetail({ id, locale }: { id: string; locale: string }) {
  const { session, login, notify } = useSession(),
    queryClient = useQueryClient(),
    router = useRouter();
  const detail = useQuery({ queryKey: ['post', id], queryFn: () => getPost(id) });
  const [body, setBody] = useState(''),
    [comment, setComment] = useState(''),
    [error, setError] = useState(''),
    [pending, setPending] = useState(''),
    [editPost, setEditPost] = useState(false);
  const [editing, setEditing] = useState<{ type: 'ANSWER' | 'COMMENT'; id: string; body: string } | null>(
      null,
    ),
    [deleting, setDeleting] = useState<Target | null>(null),
    [reporting, setReporting] = useState<Target | null>(null),
    [blocking, setBlocking] = useState<Author | null>(null);
  const [reason, setReason] = useState('SPAM'),
    [reportDetail, setReportDetail] = useState(''),
    [actionError, setActionError] = useState('');
  const read = useRef(''),
    post = detail.data?.post,
    isOwner = !!session?.user && post?.author.id === session.user.id;
  const unreadAnswers =
    detail.data?.answers
      .filter((answer) => !answer.readAt && answer.author.id !== session?.user?.id)
      .map((answer) => answer.id)
      .sort()
      .join(',') || '';
  useEffect(() => {
    const stamp = `${id}:${session?.user?.id}:${unreadAnswers}`;
    if (!isOwner || !unreadAnswers || read.current === stamp) return;
    read.current = stamp;
    api(`/posts/${id}/read`, json('POST', {}))
      .then(() =>
        Promise.all([
          queryClient.invalidateQueries({ queryKey: ['notifications'] }),
          queryClient.invalidateQueries({ queryKey: ['post', id] }),
        ]),
      )
      .catch(() => {
        read.current = '';
      });
  }, [isOwner, id, session?.user?.id, unreadAnswers, queryClient]);

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['post', id] }),
      queryClient.invalidateQueries({ queryKey: ['posts'] }),
      queryClient.invalidateQueries({ queryKey: ['notifications'] }),
    ]);
  }
  async function create(event: React.FormEvent, type: 'answer' | 'comment') {
    event.preventDefault();
    if (!session?.user) {
      login();
      return;
    }
    setPending(type);
    setError('');
    try {
      await api(
        `/posts/${id}/${type === 'answer' ? 'answers' : 'comments'}`,
        json('POST', { body: type === 'answer' ? body : comment }),
      );
      if (type === 'answer') setBody('');
      else setComment('');
      await refresh();
      notify(type === 'answer' ? '피드백을 전했어요. 나눠주셔서 고마워요!' : '댓글을 남겼어요.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending('');
    }
  }
  async function helpful(answer: Answer) {
    setPending(answer.id);
    setError('');
    try {
      await api(`/answers/${answer.id}/helpful`, json('POST', { helpful: !answer.helpful }));
      await refresh();
      notify(answer.helpful ? '도움됨 표시를 취소했어요.' : '도움이 된 피드백에 마음을 전했어요.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending('');
    }
  }
  async function action(event: React.FormEvent, kind: 'delete' | 'edit' | 'report' | 'block') {
    event.preventDefault();
    setPending(kind);
    setActionError('');
    try {
      if (kind === 'delete' && deleting) {
        await api(
          deleting.type === 'POST'
            ? `/posts/${deleting.id}`
            : `/${deleting.type === 'ANSWER' ? 'answers' : 'comments'}/${deleting.id}`,
          json('DELETE'),
        );
        if (deleting.type === 'POST') router.push(`/${locale}`);
        setDeleting(null);
        notify('삭제했어요.');
      }
      if (kind === 'edit' && editing) {
        await api(
          `/${editing.type === 'ANSWER' ? 'answers' : 'comments'}/${editing.id}`,
          json('PATCH', { body: editing.body }),
        );
        setEditing(null);
        notify('수정했어요.');
      }
      if (kind === 'report' && reporting) {
        await api(
          '/reports',
          json('POST', {
            targetType: reporting.type,
            targetId: reporting.id,
            reason,
            ...(reportDetail ? { detail: reportDetail } : {}),
          }),
        );
        setReporting(null);
        setReportDetail('');
        notify('신고를 접수했어요. 운영 검토가 필요합니다.');
      }
      if (kind === 'block' && blocking) {
        await api('/blocks', json('POST', { blockedUserId: blocking.id }));
        if (blocking.id === post?.author.id) router.push(`/${locale}`);
        setBlocking(null);
        notify('사용자를 차단했어요. 설정에서 해제할 수 있어요.');
      }
      await refresh();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setPending('');
    }
  }
  function beginReport(target: Target) {
    if (!session?.user) {
      login();
      return;
    }
    setActionError('');
    setReporting(target);
  }
  function beginBlock(author: Author) {
    if (!session?.user) {
      login();
      return;
    }
    setActionError('');
    setBlocking(author);
  }
  function actions(target: Target, text?: string) {
    const owner = target.author.id === session?.user?.id;
    return (
      <div className="content-actions">
        {owner ? (
          <>
            <button
              className="text-button"
              onClick={() => {
                setActionError('');
                if (target.type === 'POST') setEditPost(true);
                else setEditing({ type: target.type, id: target.id, body: text || '' });
              }}
            >
              <Pencil size={13} />
              수정
            </button>
            <button
              className="text-button danger-text"
              onClick={() => {
                setActionError('');
                setDeleting(target);
              }}
            >
              <Trash2 size={13} />
              삭제
            </button>
          </>
        ) : (
          <>
            <ChatLink author={target.author} locale={locale} />
            <button className="text-button" onClick={() => beginReport(target)}>
              <Flag size={13} />
              신고
            </button>
            <button className="text-button" onClick={() => beginBlock(target.author)}>
              <ShieldBan size={13} />
              차단
            </button>
          </>
        )}
      </div>
    );
  }
  if (detail.isPending) return <LoadingState text="플레이 이야기를 불러오고 있어요" />;
  if (detail.isError || !post)
    return (
      <div className="state-box">
        <ErrorNotice message={detail.error?.message || '피드백 요청을 찾을 수 없어요.'} />
        <Link className="button dark" href={`/${locale}`}>
          라운지로 돌아가기
        </Link>
      </div>
    );
  return (
    <>
      <Link className="back-link" href={`/${locale}`}>
        <ArrowLeft size={16} />
        피드백 라운지
      </Link>
      <article className="detail-card">
        <div className="post-topline">
          <span
            className={`status-pill ${post.answerCount === 0 ? 'waiting' : post.helpfulCount ? 'resolved' : 'discussing'}`}
          >
            {post.answerCount === 0
              ? '답변 기다리는 중'
              : post.helpfulCount
                ? '도움받았어요'
                : '함께 이야기 중'}
          </span>
          <span className="post-time">클래시 로얄</span>
        </div>
        <h1>{post.title}</h1>
        <div className="detail-author">
          <Avatar name={post.author.nickname} />
          <div>
            <strong>{post.author.nickname}</strong>
            <UserBadges author={post.author} />
            <span>
              {timeAgo(post.createdAt)}
              {post.updatedAt !== post.createdAt && ' · 수정됨'}
            </span>
          </div>
          {actions({ type: 'POST', id: post.id, author: post.author })}
        </div>
        <div className="prose-body">{post.body}</div>
        {post.gameProfile && <ProfileSnapshot profile={post.gameProfile} />}
        <div className="detail-footnote">
          <MessageSquare size={15} />
          새로운 시선과 구체적인 제안을 기다리고 있어요.
        </div>
      </article>
      <section className="answers-section">
        <div className="section-title-row">
          <h2>
            함께 나눈 피드백<span>{detail.data?.answers.length || 0}</span>
          </h2>
          <span className="small muted">플레이를 이야기하고, 서로를 존중해요</span>
        </div>
        {detail.data?.answers.length === 0 && (
          <div className="empty-answers">
            <MessageSquare size={26} />
            <strong>첫 번째 피드백을 기다리고 있어요</strong>
            <p>비슷한 경험이나 작은 팁부터 나눠주세요.</p>
          </div>
        )}
        {detail.data?.answers.map((answer) => (
          <article className={`answer-card ${answer.helpful ? 'helpful-answer' : ''}`} key={answer.id}>
            {answer.helpful && (
              <div className="helpful-ribbon">
                <Check size={14} />
                요청자가 도움받은 피드백
              </div>
            )}
            <div className="detail-author">
              <Avatar name={answer.author.nickname} />
              <div>
                <strong>{answer.author.nickname}</strong>
                <UserBadges author={answer.author} />
                <span>
                  {timeAgo(answer.createdAt)}
                  {answer.readAt && (
                    <>
                      <span className="read-separator">·</span>
                      <Eye size={11} />
                      요청자 확인
                    </>
                  )}
                </span>
              </div>
              {actions({ type: 'ANSWER', id: answer.id, author: answer.author }, answer.body)}
            </div>
            <div className="prose-body">{answer.body}</div>
            <div className="answer-footer">
              {isOwner && answer.author.id !== session?.user?.id ? (
                <button
                  className={`helpful-button ${answer.helpful ? 'selected' : ''}`}
                  disabled={pending === answer.id}
                  onClick={() => helpful(answer)}
                >
                  <ThumbsUp size={15} />
                  {answer.helpful ? '도움됨 취소' : '도움이 됐어요'}
                </button>
              ) : (
                <span className="small muted">
                  {answer.helpful ? '도움이 된 피드백이에요' : '경험을 나눠주셔서 고마워요'}
                </span>
              )}
            </div>
          </article>
        ))}
        <div className="answer-compose">
          <div className="row-between">
            <h3>
              <MessageSquare size={18} />
              당신의 시선을 나눠주세요
            </h3>
            {session?.user && <Avatar name={session.user.nickname} size="small" />}
          </div>
          {session?.user ? (
            <form onSubmit={(event) => create(event, 'answer')}>
              <textarea
                aria-label="피드백 내용"
                placeholder="어떤 부분을 바꾸면 좋을까요? 구체적인 이유와 함께 알려주세요. (10자 이상)"
                minLength={10}
                maxLength={10000}
                rows={5}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                required
              />
              <div className="compose-bottom">
                <span className="small muted">비난보다 제안을, 결과보다 과정을.</span>
                <button className="button primary" disabled={pending === 'answer'}>
                  {pending === 'answer' ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />}
                  피드백 남기기
                </button>
              </div>
            </form>
          ) : (
            <div className="login-prompt">
              <p>로그인하고 함께 플레이를 이야기해요.</p>
              <button className="button dark" onClick={login}>
                로그인하고 피드백 남기기
                <ArrowUpRight size={16} />
              </button>
            </div>
          )}
        </div>
        <ErrorNotice message={error} />
      </section>
      <section className="comments-section">
        <h2>
          짧은 이야기<span>{detail.data?.comments.length || 0}</span>
        </h2>
        {detail.data?.comments.map((item: Comment) => (
          <article className="comment" key={item.id}>
            <Avatar name={item.author.nickname} size="small" />
            <div className="comment-content">
              <div className="comment-heading">
                <strong>{item.author.nickname}</strong>
                <UserBadges author={item.author} compact />
                <span className="small muted">{timeAgo(item.createdAt)}</span>
              </div>
              <p>{item.body}</p>
              {actions({ type: 'COMMENT', id: item.id, author: item.author }, item.body)}
            </div>
          </article>
        ))}
        {session?.user ? (
          <form onSubmit={(event) => create(event, 'comment')} className="comment-form">
            <input
              aria-label="댓글 내용"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={2000}
              placeholder="궁금한 점이나 짧은 응원을 남겨주세요"
              required
            />
            <button className="button dark" disabled={pending === 'comment'} aria-label="댓글 등록">
              {pending === 'comment' ? <LoaderCircle size={17} className="spin" /> : <Send size={17} />}
            </button>
          </form>
        ) : (
          <button className="text-button" onClick={login}>
            로그인하고 댓글 남기기 →
          </button>
        )}
      </section>
      <PostComposer open={editPost} onOpenChange={setEditPost} post={post} locale={locale} />
      <Modal
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(null)}
        title={editing?.type === 'ANSWER' ? '피드백 수정' : '댓글 수정'}
        description="나누고 싶은 내용을 다듬어주세요."
      >
        <form className="form-stack" onSubmit={(e) => action(e, 'edit')}>
          <textarea
            aria-label="수정 내용"
            value={editing?.body || ''}
            onChange={(e) => setEditing((value) => value && { ...value, body: e.target.value })}
            rows={6}
            minLength={editing?.type === 'ANSWER' ? 10 : 1}
            maxLength={editing?.type === 'ANSWER' ? 10000 : 2000}
            required
          />
          <ErrorNotice message={actionError} />
          <button className="button primary full" disabled={pending === 'edit'}>
            수정 완료
          </button>
        </form>
      </Modal>
      <Modal
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="정말 삭제할까요?"
        description="삭제한 내용은 복구할 수 없어요. 요청을 삭제하면 연결된 피드백과 댓글도 보이지 않게 됩니다."
      >
        <form className="form-stack" onSubmit={(e) => action(e, 'delete')}>
          <ErrorNotice message={actionError} />
          <button className="button danger full" disabled={pending === 'delete'}>
            삭제하기
          </button>
          <button className="button outline full" type="button" onClick={() => setDeleting(null)}>
            돌아가기
          </button>
        </form>
      </Modal>
      <Modal
        open={!!reporting}
        onOpenChange={(open) => !open && setReporting(null)}
        title="어떤 문제가 있나요?"
        description="신고 내용은 커뮤니티 운영 검토에 사용됩니다."
      >
        <form className="form-stack" onSubmit={(e) => action(e, 'report')}>
          <Field label="신고 사유">
            <select value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="SPAM">스팸 / 광고</option>
              <option value="HARASSMENT">욕설 / 괴롭힘</option>
              <option value="PERSONAL_INFORMATION">개인정보 노출</option>
              <option value="IMPERSONATION">사칭</option>
              <option value="OTHER">기타</option>
            </select>
          </Field>
          <Field label="추가 설명 (선택)">
            <textarea
              value={reportDetail}
              onChange={(e) => setReportDetail(e.target.value)}
              rows={4}
              maxLength={1000}
            />
          </Field>
          <ErrorNotice message={actionError} />
          <button className="button dark full" disabled={pending === 'report'}>
            <Flag size={16} />
            신고 접수
          </button>
        </form>
      </Modal>
      <Modal
        open={!!blocking}
        onOpenChange={(open) => !open && setBlocking(null)}
        title={`${blocking?.nickname || ''}님을 차단할까요?`}
        description="차단한 사용자의 게시글과 답변이 보이지 않게 됩니다. 내 프로필 설정에서 해제할 수 있어요."
      >
        <form className="form-stack" onSubmit={(e) => action(e, 'block')}>
          <ErrorNotice message={actionError} />
          <button className="button danger full" disabled={pending === 'block'}>
            차단하기
          </button>
        </form>
      </Modal>
    </>
  );
}
