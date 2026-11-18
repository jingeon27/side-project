import Image from 'next/image';
import Link from 'next/link';

import { ArrowRight, Clapperboard, Play } from 'lucide-react';

import { formats } from '../features/story/model/story';
import { StudioLink } from '../features/studio/ui/StudioLink';
import styles from './page.module.css';

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
        <StudioLink variant="secondary" source="blank">
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
              <StudioLink variant="primary" className="landing-start" source="blank">
                이야기 시작하기 <ArrowRight size={17} />
              </StudioLink>
              <StudioLink className="landing-sample-link" source="sample">
                예시 작품 둘러보기
              </StudioLink>
            </div>
          </div>
          <StudioLink source="demo" className={styles.film}>
            <Image
              src="/examples/starlight-kitten.webp"
              alt=""
              width={640}
              height={368}
              preload
              unoptimized
            />
            <div className={styles.caption}>
              <div>
                <span>완성작 · 한국어 애니메이션</span>
                <h2>별빛을 안은 고양이</h2>
              </div>
              <span className={styles.play}>
                <Play size={17} aria-hidden /> 작품 열기
              </span>
            </div>
          </StudioLink>
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
        </p>
      </main>
      <footer className="landing-footer">
        <span>장면</span>
        <span>당신이 쓰는 다음 이야기</span>
      </footer>
    </div>
  );
}
