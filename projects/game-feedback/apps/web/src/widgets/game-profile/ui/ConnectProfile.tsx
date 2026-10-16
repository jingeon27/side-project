'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PlayerTagSchema } from '@game-feedback/contracts';
import { Search, LoaderCircle, Check } from 'lucide-react';
import { z } from 'zod';
import { gameProfileOptions, ProfileSnapshot, useSaveGameAccount } from '@/features/game-profile';
import type { GameProfile } from '@/shared/api';
import { useZodForm } from '@/shared/model/form';
import { ErrorNotice, Field } from '@/shared/ui';

interface IConnectProfileProps {
  onSaved?: (profile: GameProfile) => void;
}
const profileTagSchema = z.object({ playerTag: PlayerTagSchema });
type TProfileTagValues = z.output<typeof profileTagSchema>;

export function ConnectProfile({ onSaved }: IConnectProfileProps) {
  const form = useZodForm(profileTagSchema, { defaultValues: { playerTag: '' } });
  const [requestedTag, setRequestedTag] = useState<string | undefined>(undefined);
  const preview = useQuery(gameProfileOptions(requestedTag));
  const save = useSaveGameAccount();
  const tagField = form.register('playerTag');
  const handleLookup = ({ playerTag }: TProfileTagValues) => {
    if (requestedTag === playerTag) {
      void preview.refetch();
      return;
    }
    setRequestedTag(playerTag);
  };
  return (
    <form className="connect-profile" onSubmit={form.handleSubmit(handleLookup)}>
      <Field label="플레이어 태그" hint="클래시 로얄 프로필의 이름 아래에서 찾을 수 있어요.">
        <div className="input-button-row">
          <input
            {...tagField}
            onChange={(event) => {
              void tagField.onChange(event);
              setRequestedTag(undefined);
              save.reset();
            }}
            placeholder="#2PP"
            maxLength={16}
            required
          />
          <button className="button dark" type="submit" disabled={preview.isFetching}>
            {preview.isFetching ? <LoaderCircle size={17} className="spin" /> : <Search size={17} />}조회
          </button>
        </div>
      </Field>
      <ErrorNotice
        message={form.formState.errors.playerTag?.message ?? preview.error?.message ?? save.error?.message}
      />
      {requestedTag && preview.data && (
        <div className="profile-preview">
          <ProfileSnapshot profile={preview.data} />
          <p className="small muted">이 프로필이 맞나요? 태그 등록은 계정 소유권을 인증하지 않아요.</p>
          <button
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
                    setRequestedTag(undefined);
                  },
                },
              );
            }}
            disabled={save.isPending}
          >
            {save.isPending ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}이 프로필
            연결하기
          </button>
        </div>
      )}
    </form>
  );
}
