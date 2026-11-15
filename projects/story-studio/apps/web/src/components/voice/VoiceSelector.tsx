'use client';

import Link from 'next/link';

import { useQuery } from '@tanstack/react-query';

import { voiceCatalogQuery } from '../../lib/voice-client';
import {
  defaultVoiceSettings,
  presetVoices,
  speakerIds,
  voiceSettingsSchema,
  voiceStyles,
  type TVoiceSettings,
} from '../../lib/voice-training';

export function VoiceSelector({
  id,
  value = defaultVoiceSettings,
  onChange,
}: {
  id: string;
  value?: TVoiceSettings;
  onChange: (value: TVoiceSettings) => void;
}) {
  const catalog = useQuery(voiceCatalogQuery);
  const selected = value.kind === 'trained' ? value.runId : value.speaker;
  const trained = catalog.data?.trained ?? [];
  const handleVoiceChange = (selection: string) => {
    const settings = voiceSettingsSchema.parse(
      selection.startsWith('local-')
        ? { kind: 'trained', runId: selection }
        : { kind: 'preset', speaker: selection, style: value.kind === 'preset' ? value.style : 'calm' },
    );
    onChange(settings);
  };
  return (
    <div className="voice-controls">
      <div className="voice-control">
        <label htmlFor={`${id}-speaker`}>목소리</label>
        <select
          id={`${id}-speaker`}
          value={selected}
          onChange={(event) => handleVoiceChange(event.target.value)}
        >
          <optgroup label="기본 음색">
            {speakerIds.map((speaker) => (
              <option key={speaker} value={speaker}>
                {presetVoices[speaker]}
              </option>
            ))}
          </optgroup>
          {trained.length > 0 && (
            <optgroup label="학습한 목소리">
              {trained.map((voice) => (
                <option key={voice.runId} value={voice.runId}>
                  {voice.name}
                </option>
              ))}
            </optgroup>
          )}
          {value.kind === 'trained' && !trained.some((voice) => voice.runId === value.runId) && (
            <option value={value.runId}>이전에 학습한 목소리</option>
          )}
        </select>
      </div>
      {value.kind === 'preset' && (
        <div className="voice-control">
          <label htmlFor={`${id}-voice-style`}>말투</label>
          <select
            id={`${id}-voice-style`}
            value={value.style}
            onChange={(event) => onChange(voiceSettingsSchema.parse({ ...value, style: event.target.value }))}
          >
            {Object.entries(voiceStyles).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
      )}
      <Link href="/studio/voices">목소리 학습</Link>
      {catalog.isError && (
        <span role="status">
          학습한 목소리를 불러오지 못했습니다{' '}
          <button type="button" className="text-button" onClick={() => void catalog.refetch()}>
            다시 불러오기
          </button>
        </span>
      )}
    </div>
  );
}
