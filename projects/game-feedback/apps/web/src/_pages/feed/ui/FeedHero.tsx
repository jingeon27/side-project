import { ArrowUpRight, Check, Crown, MessageSquare } from 'lucide-react';

interface IFeedHeroProps {
  onCompose: () => void;
}

export function FeedHero({ onCompose }: IFeedHeroProps) {
  return (
    <section className="hero">
      <div className="hero-copy">
        <div className="hero-eyebrow">
          <span />
          PLAY BETTER, TOGETHER
        </div>
        <h1>
          혼자 고민하던 플레이,
          <br />
          <span>함께 풀어볼까요?</span>
        </h1>
        <p>
          덱부터 운영까지, 플레이어들의 새로운 시선으로.
          <br />
          작은 피드백이 다음 경기의 차이를 만듭니다.
        </p>
        <button className="button dark hero-cta" onClick={onCompose}>
          첫 피드백 요청하기
          <ArrowUpRight size={17} />
        </button>
      </div>
      <div className="hero-art" aria-hidden="true">
        <div className="hero-orbit orbit-one" />
        <div className="hero-orbit orbit-two" />
        <div className="hero-spark spark-one">✦</div>
        <div className="hero-spark spark-two">✳</div>
        <div className="art-card art-card-back">
          <Crown size={48} />
        </div>
        <div className="art-card art-card-front">
          <div className="art-card-dot" />
          <MessageSquare size={52} strokeWidth={1.6} />
          <span>GOOD PLAY!</span>
          <div className="art-card-bottom">
            <i />
            <i />
            <i />
          </div>
        </div>
        <div className="hero-mini-badge">
          <Check size={15} />
          함께라면, 한 단계 더
        </div>
      </div>
      <div className="hero-index">01 — GAME FEEDBACK COMMUNITY</div>
    </section>
  );
}
