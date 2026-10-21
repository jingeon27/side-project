'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, LoaderCircle, Search } from 'lucide-react';
import { z } from 'zod';

import { PlayerTagSchema } from '@game-feedback/contracts';
import { Button, Input } from '@side/design-system';

import {
  lookupGameProfileMutationOptions,
  ProfileSnapshot,
  useSaveGameAccount,
} from '@/features/game-profile';
import type { GameProfile } from '@/shared/api';
import { useI18n } from '@/shared/i18n';
import { useZodForm } from '@/shared/model/form';
import { ErrorNotice, Field } from '@/shared/ui';

interface IConnectProfileProps {
  onSaved?: (profile: GameProfile) => void;
}
const profileTagSchema = z.object({ playerTag: PlayerTagSchema });

export function ConnectProfile({ onSaved }: IConnectProfileProps) {
  const { t } = useI18n();
  const form = useZodForm(profileTagSchema, { defaultValues: { playerTag: '' } });
  const client = useQueryClient();
  const preview = useMutation(lookupGameProfileMutationOptions(client));
  const save = useSaveGameAccount();
  const tagField = form.register('playerTag');
  return (
    <form className="connect-profile" onSubmit={form.handleSubmit((values) => preview.mutate(values))}>
      <Field label={t('플레이어 태그')} hint={t('# 뒤에 영문과 숫자 8자리를 입력해주세요.')}>
        <div className="input-button-row">
          <Input
            {...tagField}
            aria-label={t('플레이어 태그')}
            onChange={(event) => {
              void tagField.onChange(event);
              preview.reset();
              save.reset();
            }}
            placeholder="#GG829JGY"
            maxLength={9}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            required
            disabled={save.isPending}
          />
          <Button
            variant="primary"
            size="md"
            className="button dark"
            type="submit"
            disabled={preview.isPending}
          >
            {preview.isPending ? <LoaderCircle size={17} className="spin" /> : <Search size={17} />}
            {t('조회')}
          </Button>
        </div>
      </Field>
      <ErrorNotice
        message={form.formState.errors.playerTag?.message ?? preview.error?.message ?? save.error?.message}
      />
      {preview.data && (
        <div className="profile-preview">
          <ProfileSnapshot profile={preview.data} />
          <p className="small muted">{t('이 프로필이 맞나요? 태그 등록은 계정 소유권을 인증하지 않아요.')}</p>
          <Button
            variant="primary"
            size="lg"
            fullWidth
            className="button primary full"
            type="button"
            onClick={() => {
              if (!preview.data) return;
              save.mutate(
                { playerTag: preview.data.playerTag },
                {
                  onSuccess: (profile) => {
                    onSaved?.(profile);
                    form.reset();
                    preview.reset();
                  },
                },
              );
            }}
            disabled={save.isPending}
          >
            {save.isPending ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}
            {t('내 계정에 등록')}
          </Button>
        </div>
      )}
    </form>
  );
}
