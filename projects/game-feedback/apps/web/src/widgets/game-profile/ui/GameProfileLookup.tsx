'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { z } from 'zod';

import { PlayerTagSchema } from '@game-feedback/contracts';
import { Button, Input } from '@side/design-system';

import { lookupGameProfileMutationOptions, ProfileSnapshot } from '@/features/game-profile';
import type { GameProfile } from '@/shared/api';
import { useI18n } from '@/shared/i18n';
import { useZodForm } from '@/shared/model/form';
import { ErrorNotice, Field } from '@/shared/ui';

interface IGameProfileLookupProps {
  onSelectionChange: (profile: GameProfile | null) => void;
  disabled?: boolean;
}
const profileTagSchema = z.object({ playerTag: PlayerTagSchema });

export function GameProfileLookup({ onSelectionChange, disabled = false }: IGameProfileLookupProps) {
  const { t } = useI18n();
  const form = useZodForm(profileTagSchema, { defaultValues: { playerTag: '' } });
  const client = useQueryClient();
  const preview = useMutation(lookupGameProfileMutationOptions(client));
  const tagField = form.register('playerTag');
  const errorMessage = form.formState.errors.playerTag?.message ?? preview.error?.message;
  return (
    <form
      className="connect-profile"
      onSubmit={form.handleSubmit((values) =>
        preview.mutate(values, {
          onSuccess: (profile) => onSelectionChange(profile),
        }),
      )}
    >
      <Field label={t('플레이어 태그')} hint={t('게임 프로필에 표시된 #과 영문·숫자 태그를 입력해주세요.')}>
        <div className="input-button-row">
          <Input
            {...tagField}
            aria-label={t('플레이어 태그')}
            onChange={(event) => {
              void tagField.onChange(event);
              preview.reset();
              onSelectionChange(null);
            }}
            placeholder="#GG829JGY"
            maxLength={16}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            required
            disabled={disabled || preview.isPending}
          />
          <Button
            variant="primary"
            size="md"
            type="submit"
            disabled={disabled}
            loading={preview.isPending}
            icon={<Search aria-hidden />}
          >
            {t('조회')}
          </Button>
        </div>
      </Field>
      <ErrorNotice message={errorMessage && t(errorMessage)} />
      {preview.data && (
        <div className="profile-preview">
          <ProfileSnapshot profile={preview.data} />
          <p className="small muted">{t('이 프로필이 맞나요? 태그 등록은 계정 소유권을 인증하지 않아요.')}</p>
          <Button
            type="button"
            variant="secondary"
            disabled={disabled || preview.isPending}
            onClick={() => {
              form.reset();
              preview.reset();
              onSelectionChange(null);
            }}
          >
            {t('연결하지 않기')}
          </Button>
        </div>
      )}
    </form>
  );
}
