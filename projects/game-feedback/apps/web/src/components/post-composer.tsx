'use client';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { PostInputSchema, type PostInput } from '@game-feedback/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { LoaderCircle, ArrowUpRight, Plus, Info } from 'lucide-react';
import { api, json, type Category, type GameProfile, type Post } from '@/lib/api';
import { Modal, Field, ErrorNotice, useSession } from './providers';
import { ConnectProfile, Deck } from './game-profile';
export function PostComposer({
  open,
  onOpenChange,
  locale,
  post,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  locale: string;
  post?: Post;
}) {
  const { session, notify } = useSession(),
    queryClient = useQueryClient(),
    router = useRouter();
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api<Category[]>('/categories'),
  });
  const { data: accounts } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => api<GameProfile[]>('/me/game-accounts'),
    enabled: !!session?.user,
  });
  const [error, setError] = useState(''),
    [connect, setConnect] = useState(false);
  const form = useForm<PostInput>({
    resolver: zodResolver(PostInputSchema),
    defaultValues: {
      title: post?.title || '',
      body: post?.body || '',
      categoryId: post?.categoryId || '',
      ...(post?.gameProfile ? { playerTag: post.gameProfile.playerTag } : {}),
    },
  });
  useEffect(() => {
    if (categories?.[0] && !form.getValues('categoryId')) form.setValue('categoryId', categories[0].id);
  }, [categories, form]);
  useEffect(() => {
    if (!post && accounts?.[0] && !form.getValues('playerTag'))
      form.setValue('playerTag', accounts[0].playerTag);
  }, [accounts, form, post]);
  async function submit(values: PostInput) {
    setError('');
    try {
      const result = await api<Post>(
        post ? `/posts/${post.id}` : '/posts',
        json(post ? 'PATCH' : 'POST', post ? { title: values.title, body: values.body } : values),
      );
      await queryClient.invalidateQueries({ queryKey: ['posts'] });
      await queryClient.invalidateQueries({ queryKey: ['post', result.id] });
      onOpenChange(false);
      notify(post ? '요청을 수정했어요.' : '피드백 요청을 올렸어요. 새로운 시선을 기다려보세요!');
      router.push(`/${locale}/posts/${result.id}`);
      if (!post) form.reset({ title: '', body: '', categoryId: categories?.[0]?.id || '' });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const selected = accounts?.find((account) => account.playerTag === form.watch('playerTag'));
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={post ? '피드백 요청 수정' : '어떤 플레이가 고민인가요?'}
      description="구체적인 고민을 알려주면 더 좋은 피드백을 받을 수 있어요."
    >
      <form className="form-stack" onSubmit={form.handleSubmit(submit)}>
        <Field label="게임">
          <select {...form.register('categoryId')} disabled={!!post}>
            {categories
              ?.filter((c) => c.active)
              .map((c) => (
                <option value={c.id} key={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="제목">
          <input
            {...form.register('title')}
            maxLength={120}
            placeholder="예: 호그 2.6 덱, 페카를 만나면 어떻게 운영하나요?"
          />
          <span className="field-error">
            {form.formState.errors.title && '제목을 4~120자로 입력해 주세요.'}
          </span>
        </Field>
        <Field label="플레이와 고민" hint="사용 중인 덱, 어려웠던 상황, 시도해 본 방법을 함께 적어주세요.">
          <textarea
            {...form.register('body')}
            rows={7}
            maxLength={10000}
            placeholder="현재 트로피와 주로 사용하는 덱을 알려주세요.\n어떤 상황에서 어려움을 겪고 있나요?"
          />
          <span className="field-error">
            {form.formState.errors.body && '내용을 20~10,000자로 입력해 주세요.'}
          </span>
        </Field>
        {!post && (
          <div className="composer-profile">
            <div className="row-between">
              <strong>내 게임 프로필</strong>
              <span className="small muted">요청 시점의 덱을 함께 보관해요</span>
            </div>
            {accounts?.length ? (
              <>
                <select {...form.register('playerTag')}>
                  {accounts.map((p) => (
                    <option key={p.playerTag} value={p.playerTag}>
                      {p.name} · {p.playerTag}
                    </option>
                  ))}
                </select>
                {selected && <Deck profile={selected} compact />}
              </>
            ) : (
              <button className="button outline full" type="button" onClick={() => setConnect(!connect)}>
                <Plus size={16} />
                게임 프로필 연결하기
              </button>
            )}
            {connect && (
              <ConnectProfile
                onSaved={(p) => {
                  form.setValue('playerTag', p.playerTag);
                  setConnect(false);
                }}
              />
            )}
            <p className="small muted">
              <Info size={13} /> 프로필 없이도 질문을 올릴 수 있어요. 개인정보는 적지 마세요.
            </p>
          </div>
        )}
        <ErrorNotice message={error} />
        <button className="button primary full" disabled={form.formState.isSubmitting || !categories?.length}>
          {form.formState.isSubmitting ? (
            <LoaderCircle className="spin" size={17} />
          ) : (
            <ArrowUpRight size={17} />
          )}
          {post ? '수정 완료' : '피드백 요청 올리기'}
        </button>
      </form>
    </Modal>
  );
}
