'use client';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Trophy, ShieldAlert, Search, LoaderCircle, Check, Crown } from 'lucide-react';
import { PlayerTagSchema } from '@game-feedback/contracts';
import { api, json, type GameProfile } from '@/lib/api';
import { ErrorNotice, Field, useSession } from './providers';
const cardSymbols = ['⚔️', '🏹', '🔥', '🪵', '💀', '🛡️', '⚡', '❄️'];
export function Deck({ profile, compact = false }: { profile: GameProfile; compact?: boolean }) {
  return (
    <div className={`deck ${compact ? 'deck-compact' : ''}`} aria-label={`${profile.name}님의 요청 시점 덱`}>
      {profile.deck.slice(0, 8).map((card, i) => (
        <div
          className={`deck-card deck-card-${i % 4}`}
          key={card.id}
          title={`${card.name} · 레벨 ${card.level}`}
        >
          {card.iconUrl ? (
            <img src={card.iconUrl} alt={card.name} loading="lazy" />
          ) : (
            <span aria-hidden="true">{cardSymbols[i]}</span>
          )}
          {!compact && <small>{card.name}</small>}
          <b>{card.level}</b>
        </div>
      ))}
    </div>
  );
}
export function ProfileSnapshot({ profile }: { profile: GameProfile }) {
  return (
    <section className="snapshot">
      <div className="snapshot-heading">
        <span className="snapshot-icon">
          <Crown size={21} />
        </span>
        <div>
          <strong>{profile.name}</strong>
          <span>
            {profile.playerTag} · {profile.arena}
          </span>
        </div>
        <span className="snapshot-trophies">
          <Trophy size={15} />
          {profile.trophies.toLocaleString()}
        </span>
      </div>
      <Deck profile={profile} />
      <div className="snapshot-foot">
        <span>
          <ShieldAlert size={13} />
          소유권 미인증 · 요청 작성 시점의 프로필
        </span>
        {profile.source === 'DEMO' && <span>데모 프로필</span>}
      </div>
    </section>
  );
}
export function ConnectProfile({ onSaved }: { onSaved?: (profile: GameProfile) => void }) {
  const [tag, setTag] = useState(''),
    [preview, setPreview] = useState<GameProfile | null>(null),
    [error, setError] = useState(''),
    [pending, setPending] = useState(false),
    [saving, setSaving] = useState(false);
  const queryClient = useQueryClient(),
    { notify } = useSession();
  async function lookup(event?: { preventDefault: () => void }) {
    event?.preventDefault();
    setError('');
    const result = PlayerTagSchema.safeParse(tag);
    if (!result.success) {
      setError('올바른 플레이어 태그를 입력해 주세요. 예: #2PP');
      return;
    }
    setPending(true);
    setPreview(null);
    try {
      setPreview(await api<GameProfile>(`/game-profiles/${encodeURIComponent(result.data)}`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  async function save() {
    if (!preview) return;
    setSaving(true);
    setError('');
    try {
      const result = await api<GameProfile>(
        '/me/game-accounts',
        json('POST', { playerTag: preview.playerTag }),
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['accounts'] }),
        queryClient.invalidateQueries({ queryKey: ['session'] }),
        queryClient.invalidateQueries({ queryKey: ['posts'] }),
        queryClient.invalidateQueries({ queryKey: ['post'] }),
        queryClient.invalidateQueries({ queryKey: ['chat'] }),
      ]);
      onSaved?.(result);
      notify('게임 프로필이 연결되었어요.');
      setPreview(null);
      setTag('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="connect-profile">
      <div
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            void lookup();
          }
        }}
      >
        <Field label="플레이어 태그" hint="클래시 로얄 프로필의 이름 아래에서 찾을 수 있어요.">
          <div className="input-button-row">
            <input
              value={tag}
              onChange={(e) => {
                setTag(e.target.value.toUpperCase());
                setPreview(null);
              }}
              placeholder="#2PP"
              maxLength={16}
              required
            />
            <button className="button dark" type="button" onClick={() => lookup()} disabled={pending}>
              {pending ? <LoaderCircle size={17} className="spin" /> : <Search size={17} />}조회
            </button>
          </div>
        </Field>
      </div>
      <ErrorNotice message={error} />
      {preview && (
        <div className="profile-preview">
          <ProfileSnapshot profile={preview} />
          <p className="small muted">이 프로필이 맞나요? 태그 등록은 계정 소유권을 인증하지 않아요.</p>
          <button className="button primary full" type="button" onClick={save} disabled={saving}>
            {saving ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}이 프로필 연결하기
          </button>
        </div>
      )}
    </div>
  );
}
