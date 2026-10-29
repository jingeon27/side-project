'use client';

import { useId } from 'react';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Search } from 'lucide-react';
import { z } from 'zod';

import { PlayerTagSchema } from '@game-feedback/contracts';
import { Button, Input } from '@side/design-system';

import {
  lookupGameProfileMutationOptions,
  ProfileSnapshot,
  saveGameAccountMutationOptions,
} from '@/features/game-profile';
import type { GameProfile } from '@/shared/api';
import { useI18n } from '@/shared/i18n';
import { useZodForm } from '@/shared/model/form';
import { BottomSheet, ErrorNotice, Field, useNotify, type IOverlayControlProps } from '@/shared/ui';

interface IConnectProfileProps extends IOverlayControlProps {
  onSaved?: (profile: GameProfile) => void;
}
const profileTagSchema = z.object({ playerTag: PlayerTagSchema });

export function ConnectProfile({ open, onOpenChange, onOpenChangeComplete, onSaved }: IConnectProfileProps) {
  const notify = useNotify();
  const { t } = useI18n();
  const formId = useId();
  const form = useZodForm(profileTagSchema, { defaultValues: { playerTag: '' } });
  const client = useQueryClient();
  const preview = useMutation(lookupGameProfileMutationOptions(client));
  const save = useMutation(
    saveGameAccountMutationOptions(client, () => notify(t('게임 프로필이 연결되었어요.'))),
  );
  const tagField = form.register('playerTag');
  const errorMessage =
    form.formState.errors.playerTag?.message ?? preview.error?.message ?? save.error?.message;
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={onOpenChangeComplete}
      title={t('게임 계정 등록')}
      description={t('플레이어 태그로 트로피와 아레나를 확인해요.')}
      dismissible={!preview.isPending && !save.isPending}
      footer={
        <>
          <Button
            variant="secondary"
            type="button"
            disabled={preview.isPending || save.isPending}
            onClick={() => onOpenChange(false)}
          >
            {t('취소')}
          </Button>
          {preview.data ? (
            <Button
              variant="primary"
              size="lg"
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
              loading={save.isPending}
              icon={<Check aria-hidden />}
            >
              {t('내 계정에 등록')}
            </Button>
          ) : (
            <Button
              variant="primary"
              size="lg"
              type="submit"
              form={formId}
              loading={preview.isPending}
              icon={<Search aria-hidden />}
            >
              {t('조회')}
            </Button>
          )}
        </>
      }
    >
      <form
        id={formId}
        className="connect-profile"
        onSubmit={form.handleSubmit((values) => preview.mutate(values))}
      >
        <Field label={t('플레이어 태그')} hint={t('게임 프로필에 표시된 #과 영문·숫자 태그를 입력해주세요.')}>
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
              maxLength={16}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              required
              disabled={save.isPending}
            />
          </div>
        </Field>
        <ErrorNotice message={errorMessage && t(errorMessage)} />
        {preview.data && (
          <div className="profile-preview">
            <ProfileSnapshot profile={preview.data} />
            <p className="small muted">
              {t('이 프로필이 맞나요? 태그 등록은 계정 소유권을 인증하지 않아요.')}
            </p>
          </div>
        )}
      </form>
    </BottomSheet>
  );
}
