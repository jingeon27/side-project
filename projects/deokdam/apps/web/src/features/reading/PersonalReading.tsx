'use client';

import { type ReactNode } from 'react';
import Link from 'next/link';

import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, ChevronDown, Clover, ShieldCheck } from 'lucide-react';
import { Controller, useForm, useWatch } from 'react-hook-form';

import { Button } from '@side/design-system/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@side/design-system/ui/select';
import { toast } from '@side/design-system/ui/sonner';

import { RewardedReading } from '@/features/ads/RewardedReading';
import type { TActivityPage } from '@/features/journal/activity';
import { saveActivity } from '@/features/journal/device-history';
import { RecordForm } from '@/features/journal/RecordForm';
import { track } from '@/shared/analytics/browser';
import { event } from '@/shared/analytics/events';
import { topics, type TTopic } from '@/shared/topics';

import { BirthChartReport } from './BirthChartReport';
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
  birth: TBirthInput;
  chart: IChart;
  input: TReadingInput;
  reading: TReading;
}

const experienceExamples = {
  job: '친구와 면접 답변을 소리 내 연습했더니 다음 날 말이 편했어요.',
  parent: '아이에게 저녁 메뉴를 물어보니 먼저 학교 얘기를 꺼냈어요.',
  admission: '모의고사에서 틀린 문제를 이유별로 나누니 복습할 순서가 보였어요.',
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

  const archive = useMutation({
    mutationFn: (page: Extract<TActivityPage, { kind: 'reading' }>) => saveActivity(page),
    onSuccess: (result) => {
      if (result.created) track(event.HistorySaved, { kind: 'reading', location: result.location });
    },
    onError: () => toast.error('풀이를 기록에 담지 못했어요. 아래에서 다시 저장할 수 있어요.'),
  });
  const readingRequest = useMutation({
    mutationFn: async ({
      values,
      fallback,
    }: {
      values: IReadingForm;
      fallback: boolean;
    }): Promise<IResult | undefined> => {
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
        track(event.ReadingShown, {
          topic,
          mode: reading.mode,
          cached: Boolean(cached),
          adult: chart.adult,
          grounded: Boolean(reading.sources?.length),
          withExperience: Boolean(experience),
        });
        const practice = practiceFor(input);
        archive.mutate({
          kind: 'reading',
          topic,
          concern: input.concern,
          element: input.element,
          reading: { ...reading, action: reading.action ?? practice.action },
        });
        return { birth: birth.data, chart, input, reading };
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
    },
    gcTime: 0,
  });
  const handleReading = (values: IReadingForm, fallback = false) =>
    readingRequest.mutateAsync({ values, fallback });
  const result = readingRequest.data;

  if (result) {
    const practice = practiceFor(result.input);
    const action = result.reading.action ?? practice.action;
    const sources = result.reading.sources ?? [];
    return (
      <div className="reading-result">
        <Button
          variant="ghost"
          icon={<ArrowLeft size={16} aria-hidden />}
          onClick={() => readingRequest.reset()}
        >
          입력으로 돌아가기
        </Button>
        <div className="episode-heading">
          <p className="label">{topics[topic].label}</p>
          <h1>내 사주 풀이</h1>
        </div>
        {children}
        <BirthChartReport chart={result.chart} birth={result.birth} />
        <section className="reading-panel reading-interpretation">
          <p className="label">일간 오행 · {elementDescriptions[result.chart.element].label}</p>
          <h2>{result.reading.mode === 'ai' ? '오늘의 AI 풀이' : '오늘의 기본 풀이'}</h2>
          <p className="reading-concern">
            {topics[topic].concerns.find((item) => item.id === result.input.concern)?.label}
          </p>
          <p>{result.reading.interpretation}</p>
          {archive.isError && archive.variables && (
            <Button
              variant="secondary"
              onClick={() => archive.variables && archive.mutate(archive.variables)}
            >
              이 풀이 다시 저장
            </Button>
          )}
          {result.reading.example && (
            <div className="reading-example">
              <h3>이렇게 해보세요</h3>
              <p>{result.reading.example}</p>
            </div>
          )}
          {result.input.experience && (
            <p className="small-muted reading-experience-note">
              <strong>참고한 경험</strong> {experienceThemes[result.input.experience].label}.{' '}
              {result.reading.mode === 'ai' && experienceThemes[result.input.experience].followUp}
            </p>
          )}
        </section>
        {archive.isPending && (
          <p className="small-muted" role="status">
            이 풀이를 보관하고 있어요.
          </p>
        )}
        {archive.isSuccess && (
          <p className="small-muted reading-archive-link">
            {archive.data.location === 'device' && '이 기기에 보관했어요. '}
            <Link
              className="plain-link"
              href="/journal"
              onClick={() => track(event.HistoryOpenClicked, { surface: 'reading' })}
            >
              기록장에서 다시 보기
            </Link>
          </p>
        )}
        <section className="reading-action" aria-labelledby="reading-action-title">
          <header className="reading-action-heading">
            <div className="label">
              <Clover size={18} aria-hidden />
              오늘의 덕
            </div>
            <h2 id="reading-action-title">{action}</h2>
          </header>
          <RecordForm action={action} alternative={practice.alternative} topic={topic} />
        </section>
        <details
          className="reading-basis"
          onToggle={(change) => {
            if (change.currentTarget.open)
              track(event.ReadingBasisOpened, { topic, mode: result.reading.mode });
          }}
        >
          <summary>
            {sources.length ? '만세력과 참고 자료' : '만세력 보기'}
            <ChevronDown size={17} aria-hidden />
          </summary>
          <div className="reading-basis-content">
            <p>
              연·월주는 한국 시각의 절기 경계, 일·시주는 한국의 현지 시각으로 계산해요. 네 기둥의 전통적
              의미는{' '}
              <a
                className="plain-link"
                href="https://encykorea.aks.ac.kr/Article/E0025957"
                target="_blank"
                rel="noreferrer"
              >
                한국민족문화대백과사전의 사주 항목
              </a>
              에서 확인할 수 있어요.
            </p>
            {sources.length > 0 && (
              <div className="reading-sources small-muted">
                <h3>풀이에 참고한 자료</h3>
                <ul>
                  {sources.map(({ id, title }) => (
                    <li key={id}>{title}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </details>
        {adUnit && result.chart.adult && (
          <RewardedReading
            key={[topic, result.input.concern, result.input.element].join('/')}
            unit={adUnit}
            input={result.input}
          />
        )}
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
                : '고른 고민과 만세력으로 오늘 해볼 일을 찾아요.'}
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
                <span>
                  생년월일로 태어난 해·달·날의 기둥을 이 기기에서 계산해요. 시각을 적으면 네 번째 기둥도 읽을
                  수 있어요.
                </span>
              </p>
            </div>
            <div className="reading-field reading-experience">
              <label className="field-label" htmlFor="past-experience">
                과거에 겪은 일 <span>선택</span>
              </label>
              <p className="small-muted" id="past-experience-help">
                겪은 일과 그때 내가 한 행동을 한두 문장 적어보세요. 원문은 이 기기에 두고, 경험의 주제만
                풀이에 참고해요.
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
          {form.formState.isSubmitting && (
            <p className="form-progress small-muted" role="status">
              풀이 자료를 살피고 있어요.
            </p>
          )}
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
