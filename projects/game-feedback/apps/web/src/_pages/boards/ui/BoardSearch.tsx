'use client';

import { Suspense, useEffect } from 'react';
import { FormProvider, useFormContext } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import { useBrowserSearch } from '@/shared/navigation';
import { z } from 'zod';
import { Search } from 'lucide-react';
import { Button, Input } from '@side/design-system';
import { appRoutes } from '@game-feedback/bridge';
import { parseBattleMode } from '@/features/battle';
import { useZodForm } from '@/shared/model/form';
import { useI18n } from '@/shared/i18n';

const boardSearchSchema = z.object({ q: z.string().max(100) });

export function BoardSearch({ locale, slug }: { locale: string; slug: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const form = useZodForm(boardSearchSchema, { defaultValues: { q: '' } });
  return (
    <FormProvider {...form}>
      <Suspense fallback={null}>
        <BoardSearchUrlSync />
      </Suspense>
      <form
        className="board-search"
        role="search"
        aria-label={t('게시판 검색')}
        onSubmit={form.handleSubmit(({ q }) => {
          const params = new URLSearchParams(window.location.search);
          const game = params.get('game') ?? undefined;
          router.replace(
            appRoutes.boards(locale, slug, q.trim(), game, parseBattleMode(params.get('battleMode'))),
          );
        })}
      >
        <Input
          {...form.register('q')}
          maxLength={100}
          aria-label={t('게시판 검색')}
          placeholder={t('게시판 검색')}
        />
        <Button variant="secondary" size="md" type="submit" aria-label={t('검색')}>
          <Search size={18} />
        </Button>
      </form>
    </FormProvider>
  );
}

function BoardSearchUrlSync() {
  const params = new URLSearchParams(useBrowserSearch());
  const q = (params.get('q') ?? '').trim().slice(0, 100);
  const { resetField } = useFormContext<z.infer<typeof boardSearchSchema>>();
  useEffect(() => {
    resetField('q', { defaultValue: q });
  }, [q, resetField]);
  return null;
}
