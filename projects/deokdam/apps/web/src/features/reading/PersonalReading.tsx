'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';

import { ArrowLeft, ChevronDown, Clover, ShieldCheck } from 'lucide-react';
import { Controller, useForm, useWatch } from 'react-hook-form';

import { Button } from '@side/design-system/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@side/design-system/ui/select';

import { RewardedReading } from '@/features/ads/RewardedReading';
import { RecordForm } from '@/features/journal/RecordForm';
import { track } from '@/shared/analytics/browser';
import { event } from '@/shared/analytics/events';
import { topics, type TTopic } from '@/shared/topics';

import type { IChart } from './chart';
import {
  BirthDateError,
  birthSchema,
  type TBirthInput,
  type TReading,
  type TReadingInput,
} from './contracts';
import { classifyExperience, experienceThemes } from './experience';
import { basicInterpretation, elementDescriptions, practiceFor } from './interpretation';
import { readCachedReading, rememberReading } from './local-reading';
import { requestReading } from './reading-client';

interface IReadingForm extends TBirthInput {
  concern: string;
  pastExperience: string;
}

interface IResult {
  chart: IChart;
  input: TReadingInput;
  reading: TReading;
}

const experienceExamples = {
  job: '예 지난 면접에 친구와 연습하고 갔더니 답변이 편했어요.',
  parent: '예 아이에게 저녁 메뉴를 물어보니 먼저 자기 이야기를 시작했어요.',
  admission: '예 모의고사에서 틀린 문제를 나눠 복습하니 다음 공부가 쉬웠어요.',
};

export function PersonalReading({
  topic,
  adUnit,
  children,
}: {
  topic: TTopic;
  adUnit?: string;
  children: ReactNode;
}) {
  const [result, setResult] = useState<IResult>();
  const concernOptions = topics[topic].concerns.map(({ id, label }) => ({ value: id, label }));
  const form = useForm<IReadingForm>({
    defaultValues: {
      concern: topics[topic].concerns[0].id,
      calendar: 'solar',
      date: '',
      time: '',
      leapMonth: false,
      pastExperience: '',
    },
  });
  const calendar = useWatch({ control: form.control, name: 'calendar' });
  const error = form.formState.errors.root?.message;

  const handleReading = async (values: IReadingForm, fallback = false) => {
    const birth = birthSchema.safeParse(values);
    if (!birth.success) {
      form.setError('root', {
        message: birth.error.issues[0]?.message ?? '입력한 생년월일과 출생 시각을 확인해 주세요.',
      });
      return;
    }
    form.clearErrors();
    const experience = classifyExperience(values.pastExperience);
    track(event.ReadingRequested, { topic, withExperience: Boolean(experience) });
    try {
      const { calculateChart } = await import('./chart');
      const chart = calculateChart(birth.data);
      const input: TReadingInput = { topic, concern: values.concern, element: chart.element, experience };
      const cached = readCachedReading(input);
      const reading =
        cached ??
        (fallback
          ? { mode: 'basic' as const, interpretation: basicInterpretation(input) }
          : await requestReading(input));
      rememberReading(input, reading);
      setResult({ chart, input, reading });
      track(event.ReadingShown, {
        topic,
        mode: reading.mode,
        cached: Boolean(cached),
        adult: chart.adult,
        grounded: Boolean(reading.sources?.length),
        withExperience: Boolean(experience),
      });
    } catch (reason) {
      if (reason instanceof BirthDateError) {
        form.setError('root', { type: 'validation', message: reason.message });
        return;
      }
      form.setError('root', {
        type: 'unavailable',
        message: '지금 풀이를 불러오지 못했어요. 다시 시도하거나 기본 풀이를 열어보세요.',
      });
    }
  };

  if (result) {
    const practice = practiceFor(result.input);
    return (
      <div className="reading-result">
        <Button
          variant="ghost"
          icon={<ArrowLeft size={16} aria-hidden />}
          onClick={() => setResult(undefined)}
        >
          입력으로 돌아가기
        </Button>
        <div className="episode-heading">
          <p className="label">{topics[topic].label}</p>
          <h1>내 사주 풀이</h1>
        </div>
        {children}
        <div className="reading-panel">
          <dl className="pillars" aria-label="만세력">
            {[
              ['년주', result.chart.year],
              ['월주', result.chart.month],
              ['일주', result.chart.day],
              ['시주', result.chart.time],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value ?? '미상'}</dd>
              </div>
            ))}
          </dl>
          <p className="small-muted">
            일간 오행 {elementDescriptions[result.chart.element].label}
            {!result.chart.year || !result.chart.month ? '. 절기 전후를 가르려면 출생 시각이 필요해요.' : ''}
          </p>
          <h2>{result.reading.mode === 'ai' ? '오늘의 AI 풀이' : '오늘의 기본 풀이'}</h2>
          <p>{result.reading.interpretation}</p>
          {result.input.experience && (
            <p className="small-muted reading-experience-note">
              <strong>경험 주제</strong> {experienceThemes[result.input.experience].label}
            </p>
          )}
          {result.reading.sources?.length ? (
            <p className="small-muted reading-basis">
              <strong>풀이에 참고한 자료</strong>
              <br />
              {result.reading.sources.map(({ title }) => title).join(', ')}
            </p>
          ) : null}
        </div>
        <section className="deok-card">
          <div className="label">
            <Clover size={18} aria-hidden />
            오늘의 덕
          </div>
          <h2>{practice.action}</h2>
        </section>
        <RecordForm action={practice.action} alternative={practice.alternative} topic={topic} />
        {adUnit && result.chart.adult && <RewardedReading unit={adUnit} input={result.input} />}
        {result.chart.adult && topic !== 'admission' && (
          <aside className="reading-invitation">
            <p>한 주 동안 이어갈 실천을 골라보세요.</p>
            <Link className="plain-link" href={'/shop?topic=' + topic}>
              7일 풀이 미리 보기
            </Link>
          </aside>
        )}
      </div>
    );
  }

  return (
    <form className="reading-form" onSubmit={form.handleSubmit((values) => handleReading(values))}>
      <div className="reading-scroll">
        <div className="site-width reading-width reading-form-body">
          <div className="episode-heading reading-heading">
            <h1>내 사주 풀이</h1>
            <p>
              {topic === 'parent'
                ? '부모인 내 사주로, 오늘 아이에게 건넬 말을 찾아요.'
                : '요즘의 고민을 고르고 내 사주를 살펴봐요.'}
            </p>
          </div>
          {children}
          <div className="reading-fields">
            <div className="reading-field">
              <label className="field-label" htmlFor="concern" id="concern-label">
                가까운 고민
              </label>
              <Controller
                control={form.control}
                name="concern"
                render={({ field }) => (
                  <Select
                    items={concernOptions}
                    value={field.value}
                    onValueChange={(value) => {
                      if (value !== null) field.onChange(value);
                    }}
                  >
                    <SelectTrigger
                      id="concern"
                      aria-labelledby="concern-label"
                      ref={field.ref}
                      onBlur={field.onBlur}
                      className="reading-select-trigger"
                      hideIcon
                    >
                      <SelectValue />
                      <span className="reading-select-chevron">
                        <ChevronDown size={17} aria-hidden />
                      </span>
                    </SelectTrigger>
                    <SelectContent
                      align="start"
                      alignItemWithTrigger={false}
                      sideOffset={6}
                      className="reading-select-list"
                    >
                      {concernOptions.map(({ value, label }) => (
                        <SelectItem key={value} value={value} className="reading-select-option">
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="reading-birth">
              <fieldset className="calendar-choice">
                <legend>달력</legend>
                <label className="choice">
                  <input type="radio" value="solar" {...form.register('calendar')} />
                  양력
                </label>
                <label className="choice">
                  <input type="radio" value="lunar" {...form.register('calendar')} />
                  음력
                </label>
              </fieldset>
              {calendar === 'lunar' && (
                <label className="choice">
                  <input type="checkbox" {...form.register('leapMonth')} />
                  윤달이에요
                </label>
              )}
              <div className="birth-fields">
                <div className="reading-field">
                  <label className="field-label" htmlFor="birth-date">
                    내 생년월일
                  </label>
                  <input
                    id="birth-date"
                    inputMode="numeric"
                    placeholder="예 20010418"
                    maxLength={10}
                    aria-describedby="birth-info"
                    required
                    {...form.register('date')}
                  />
                </div>
                <div className="reading-field">
                  <label className="field-label" htmlFor="birth-time">
                    출생 시각 <span>선택</span>
                  </label>
                  <input
                    id="birth-time"
                    type="time"
                    aria-describedby="birth-info"
                    {...form.register('time')}
                  />
                </div>
              </div>
              <p className="birth-info small-muted" id="birth-info">
                <ShieldCheck size={16} aria-hidden />
                <span>만세력은 이 기기에서 계산해요. 시각을 모르면 비워두세요.</span>
              </p>
            </div>
            <div className="reading-field reading-experience">
              <label className="field-label" htmlFor="past-experience">
                과거에 겪은 일 <span>선택</span>
              </label>
              <p className="small-muted" id="past-experience-help">
                겪은 일과 그때 내가 한 행동을 적어보세요. 문장은 이 기기에 두고, 경험의 주제만 풀이에
                참고해요.
              </p>
              <textarea
                id="past-experience"
                aria-describedby="past-experience-help"
                placeholder={experienceExamples[topic]}
                rows={3}
                maxLength={360}
                {...form.register('pastExperience')}
              />
            </div>
          </div>
        </div>
      </div>
      <div className="form-action-bar">
        <div className="site-width reading-width form-action-inner">
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
          <div className="form-action-buttons">
            <Button type="submit" loading={form.formState.isSubmitting} fullWidth>
              내 풀이 보기
            </Button>
            {form.formState.errors.root?.type === 'unavailable' && (
              <Button
                variant="secondary"
                onClick={form.handleSubmit((values) => handleReading(values, true))}
              >
                기본 풀이 열기
              </Button>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}
