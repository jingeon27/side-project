'use client';

import { useEffect, useRef, useState } from 'react';

import { Button } from '@side/design-system/ui/button';

import type { TReadingInput } from '@/features/reading/contracts';
import { elementDescriptions } from '@/features/reading/interpretation';
import { track } from '@/shared/analytics/browser';
import { event } from '@/shared/analytics/events';
import { seoulToday } from '@/shared/seoul-time';

import { playRewardedAd } from './rewarded';

const followUp = {
  job: '이미 해낸 일 하나에서 상황, 내가 한 행동, 달라진 점을 한 문장씩 적어보세요. 읽어준 친구가 더 듣고 싶어 한 부분부터 다듬어도 좋아요.',
  parent:
    '먼저 내 마음을 한 문장으로 적어보세요. 아이에게는 바로 답할 수 있는 짧은 질문 하나를 건네고, 답이 올 시간을 주세요.',
  admission:
    '마음이 편해지는 말 한 문장을 골라보세요. 오늘 나에게 먼저 건네고, 듣고 싶다면 가까운 사람에게 알려주세요.',
};

export function RewardedReading({ unit, input }: { unit: string; input: TReadingInput }) {
  const rewardKey = ['deokdam.reward', input.topic, input.concern, input.element].join('.');
  const [granted, setGranted] = useState(() => {
    try {
      return sessionStorage.getItem(rewardKey) === seoulToday();
    } catch {
      return false;
    }
  });
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState('');
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);

  const handleAd = async () => {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setPending(true);
    setFeedback('');
    track(event.RewardClicked, { topic: input.topic });
    try {
      await playRewardedAd(unit, controller.signal, () => {
        setGranted(true);
        try {
          sessionStorage.setItem(rewardKey, seoulToday());
        } catch {
          // The current screen still shows the granted reading.
        }
        track(event.RewardGranted, { topic: input.topic });
      });
      setFeedback('보상이 표시되지 않았다면 광고를 다시 열 수 있어요.');
    } catch {
      if (!controller.signal.aborted)
        setFeedback('지금 열 수 있는 광고가 없어요. 잠시 뒤 다시 시도해 주세요.');
    } finally {
      if (!controller.signal.aborted) setPending(false);
      active.current = null;
    }
  };

  return (
    <section className="reading-panel bonus-panel" aria-labelledby="bonus-heading">
      <h2 id="bonus-heading">내 고민 추가 풀이</h2>
      {granted ? (
        <p role="status">
          {elementDescriptions[input.element].label}의 상징을 오늘의 실천에 연결해 보세요.{' '}
          {followUp[input.topic]}
        </p>
      ) : (
        <>
          <p>선택해서 광고를 보면 추가 풀이 한 장이 열려요.</p>
          <Button variant="secondary" loading={pending} onClick={handleAd}>
            광고 1편 보고 추가 풀이 열기
          </Button>
          {feedback && (
            <p role="status" className="small-muted">
              {feedback}
            </p>
          )}
        </>
      )}
    </section>
  );
}
