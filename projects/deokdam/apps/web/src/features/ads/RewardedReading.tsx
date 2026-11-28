'use client';

import { useEffect, useRef } from 'react';

import { useCallbackRef } from '@radix-ui/react-use-callback-ref';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Button } from '@side/design-system/ui/button';
import { toast } from '@side/design-system/ui/sonner';

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
  const day = seoulToday();
  const cache = useQueryClient();
  const rewardQueryKey = ['reward', rewardKey, day];
  const stored = () => {
    try {
      return sessionStorage.getItem(rewardKey) === day;
    } catch {
      return false;
    }
  };
  const reward = useQuery({
    queryKey: rewardQueryKey,
    queryFn: stored,
    staleTime: Infinity,
    initialData: stored,
  });
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  const handleGrant = useCallbackRef(() => {
    cache.setQueryData(rewardQueryKey, true);
    try {
      sessionStorage.setItem(rewardKey, day);
    } catch {
      /* The current screen still shows the reward. */
    }
    track(event.RewardGranted, { topic: input.topic });
  });
  const ad = useMutation({
    mutationFn: async () => {
      const controller = new AbortController();
      active.current = controller;
      track(event.RewardClicked, { topic: input.topic });
      try {
        return await playRewardedAd(unit, controller.signal, handleGrant);
      } finally {
        active.current = null;
      }
    },
    onSuccess: () => {
      if (!cache.getQueryData(rewardQueryKey)) toast.info('광고를 마치면 추가 풀이가 열려요.');
    },
    onError: (error) => {
      if (error.name !== 'AbortError')
        toast.error('지금 열 수 있는 광고가 없어요. 잠시 뒤 다시 시도해 주세요.');
    },
  });
  return (
    <section className="reading-panel bonus-panel" aria-labelledby="bonus-heading">
      <h2 id="bonus-heading">내 고민 추가 풀이</h2>
      {reward.data ? (
        <p role="status">
          {elementDescriptions[input.element].label}의 상징을 오늘의 실천에 연결해 보세요.{' '}
          {followUp[input.topic]}
        </p>
      ) : (
        <>
          <p>선택해서 광고를 보면 추가 풀이 한 장이 열려요.</p>
          <Button
            variant="secondary"
            loading={ad.isPending}
            onClick={() => {
              if (!active.current && !ad.isPending) ad.mutate();
            }}
          >
            광고 1편 보고 추가 풀이 열기
          </Button>
        </>
      )}
    </section>
  );
}
