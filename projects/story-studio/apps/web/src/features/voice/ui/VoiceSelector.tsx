'use client';

import { useQuery } from '@tanstack/react-query';

import {
  Button,
  FormField,
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from '@side/design-system';
import { ButtonLink } from '@side/design-system/next';

import { voiceCatalogQuery } from '../api/voice-client';
import {
  defaultVoiceSettings,
  presetVoices,
  speakerIds,
  voiceSettingsSchema,
  voiceStyles,
  type TVoiceSettings,
} from '../model/voice-training';

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
        <FormField label="목소리">
          <NativeSelect
            id={`${id}-speaker`}
            value={selected}
            onChange={(event) => handleVoiceChange(event.target.value)}
          >
            <NativeSelectOptGroup label="기본 음색">
              {speakerIds.map((speaker) => (
                <NativeSelectOption key={speaker} value={speaker}>
                  {presetVoices[speaker]}
                </NativeSelectOption>
              ))}
            </NativeSelectOptGroup>
            {trained.length > 0 && (
              <NativeSelectOptGroup label="학습한 목소리">
                {trained.map((voice) => (
                  <NativeSelectOption key={voice.runId} value={voice.runId}>
                    {voice.name}
                  </NativeSelectOption>
                ))}
              </NativeSelectOptGroup>
            )}
            {value.kind === 'trained' && !trained.some((voice) => voice.runId === value.runId) && (
              <NativeSelectOption value={value.runId}>이전에 학습한 목소리</NativeSelectOption>
            )}
          </NativeSelect>
        </FormField>
      </div>
      {value.kind === 'preset' && (
        <div className="voice-control">
          <FormField label="말투">
            <NativeSelect
              id={`${id}-voice-style`}
              value={value.style}
              onChange={(event) =>
                onChange(voiceSettingsSchema.parse({ ...value, style: event.target.value }))
              }
            >
              {Object.entries(voiceStyles).map(([key, label]) => (
                <NativeSelectOption key={key} value={key}>
                  {label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </FormField>
        </div>
      )}
      <ButtonLink variant="ghost" size="sm" href="/studio/voices">
        목소리 학습
      </ButtonLink>
      {catalog.isError && (
        <span role="status">
          학습한 목소리를 불러오지 못했습니다{' '}
          <Button variant="ghost" size="sm" type="button" onClick={() => void catalog.refetch()}>
            다시 불러오기
          </Button>
        </span>
      )}
    </div>
  );
}
