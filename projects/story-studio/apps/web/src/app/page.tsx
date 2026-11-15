import Link from 'next/link';

import { ArrowRight, Clapperboard } from 'lucide-react';

import { StudioLink } from '../components/StudioLink';
import { formats } from '../lib/story';

export default function Home() {
  return (
    <div className="landing">
      <header className="landing-header">
        <Link href="/" className="brand">
          <span className="brand-mark">
            <Clapperboard size={22} />
          </span>
          <span>
            장면<small>STORY STUDIO</small>
          </span>
        </Link>
        <StudioLink className="button secondary" source="blank">
          작업실 열기 <ArrowRight size={16} />
        </StudioLink>
      </header>
      <main className="landing-main">
        <section className="landing-hero">
          <div className="landing-intro">
            <h1>
              당신의 상상에
              <br />
              <em>다음 장면을</em>
            </h1>
            <p>
              아이디어 한 줄에서 영화, 웹툰, 소설까지
              <br />
              쓰고, 다듬고, 완성하는 한국어 창작 스튜디오
            </p>
            <div className="landing-actions">
              <StudioLink className="button primary" source="blank">
                이야기 시작하기 <ArrowRight size={17} />
              </StudioLink>
              <StudioLink className="landing-sample-link" source="sample">
                예시 작품 둘러보기
              </StudioLink>
            </div>
          </div>
          <div className="landing-preview">
            <div className="preview-paper">
              <div className="preview-paper-meta">
                <span>예시 원고</span>
                <span>애니메이션, 3개 장면</span>
              </div>
              <h2>
                비가 오면,
                <br />
                편지가 도착해
              </h2>
              <p>
                비가 쏟아지는 골목 끝<br />
                지도에도 없는 우체국에 불이 켜졌다
              </p>
              <blockquote>“그런데… 보낸 사람이 저예요?”</blockquote>
              <div className="paper-scene">
                <span>장면 1</span>
                <strong>지도에 없는 우체국</strong>
                <p>
                  빗방울이 노란 우비 위로 톡톡 떨어졌다
                  <br />
                  서우는 처음 보는 주황빛 창문을 발견했다
                </p>
              </div>
              <StudioLink source="sample">
                이 이야기를 작업실에서 열기 <ArrowRight size={15} />
              </StudioLink>
            </div>
          </div>
        </section>
        <section className="landing-formats" aria-labelledby="formats-heading">
          <h2 id="formats-heading">어떤 이야기도, 나만의 방식으로</h2>
          <div>
            {formats.map((format) => (
              <StudioLink key={format.id} source={format.id}>
                <strong>{format.name}</strong>
                <span>{format.description}</span>
                <ArrowRight size={15} />
              </StudioLink>
            ))}
          </div>
        </section>
        <section className="landing-workflow" aria-label="창작 순서">
          <div>
            <span>01</span>
            <h3>한국어로 쓰기</h3>
            <p>
              아이디어를 적으면 줄거리와 인물,
              <br />첫 원고를 함께 구성해요
            </p>
          </div>
          <div>
            <span>02</span>
            <h3>장면으로 만들기</h3>
            <p>
              원고를 직접 다듬고 필요한 컷과
              <br />
              짧은 영상을 생성해요
            </p>
          </div>
          <div>
            <span>03</span>
            <h3>작품으로 간직하기</h3>
            <p>
              한글 원고, 말풍선을 담은 웹툰,
              <br />
              자막을 넣은 영상으로 저장해요
            </p>
          </div>
        </section>
        <p className="landing-note">
          API 키 없이, 이 컴퓨터의 로컬 모델로 글, 영상, 한국어 목소리를 만들어요
          <StudioLink source="demo">실제로 만든 한국어 애니메이션 보기</StudioLink>
        </p>
      </main>
      <footer className="landing-footer">
        <span>장면</span>
        <span>당신이 쓰는 다음 이야기</span>
      </footer>
    </div>
  );
}
