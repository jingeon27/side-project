'use client';
import { useI18n } from '@/shared/i18n';
import { MotionButton } from '@/shared/ui';
import { ArrowUpRight } from 'lucide-react';

interface IFeedHeroProps {
  onCompose: () => void;
}

export function FeedHero({ onCompose }: IFeedHeroProps) {
  const { t } = useI18n();
  return (
    <section className="hero">
      <div className="hero-copy">
        <h1>
          {t('혼자 고민하던 플레이,')}
          <br />
          <span>{t('함께 풀어볼까요?')}</span>
        </h1>
        <p>
          {t('덱부터 운영까지, 플레이어들의 새로운 시선으로.')}
          <br />
          {t('작은 피드백이 다음 경기의 차이를 만듭니다.')}
        </p>
        <MotionButton
          variant="primary"
          size="md"
          type="submit"
          className="button dark hero-cta"
          onClick={onCompose}
        >
          {t('첫 피드백 요청하기')}
          <ArrowUpRight size={17} />
        </MotionButton>
      </div>
    </section>
  );
}
