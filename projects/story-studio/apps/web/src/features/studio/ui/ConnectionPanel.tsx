'use client';

import Link from 'next/link';

import { X } from 'lucide-react';

export type TConfiguration = {
  configured: boolean;
  textModel: string;
  imageModel: string;
  videoModel: string;
  provider?: 'local' | 'cloud';
  voiceModel?: string;
  materialModel?: string;
  voiceReady?: boolean;
  voiceTrainingReady?: boolean;
  imageReady?: boolean;
  videoReady?: boolean;
  demoReady?: boolean;
};
// How the studio is connected: the local models in use, or the cloud key to set.
export function ConnectionPanel({
  config,
  local,
  onClose,
  onRefresh,
}: {
  config: TConfiguration | null;
  local: boolean;
  onClose: () => void;
  onRefresh: () => void;
}) {
  return (
    <section className="connection-panel" aria-label="AI 연결 안내">
      <div className="section-heading">
        <h2>{local ? '로컬 모델' : '클라우드 연결'}</h2>
        <button className="icon-button" aria-label="연결 안내 닫기" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      {local ? (
        <>
          <p>
            글, 컷, 영상과 한국어 음성을 이 컴퓨터에서 만듭니다. API 키와 외부 생성 서비스가 필요하지
            않습니다.
          </p>
          <div className="model-list">
            <span>
              글, 대본<strong>{config?.textModel || 'Gemma 4'}</strong>
            </span>
            <span>
              참고 자료 검색<strong>{config?.materialModel || 'EmbeddingGemma 2'}</strong>
            </span>
            <span>
              이미지<strong>{config?.imageModel || 'FLUX.2 Klein'}</strong>
            </span>
            <span>
              영상<strong>{config?.videoModel || 'Wan 2.2'}</strong>
            </span>
            <span>
              한국어 목소리<strong>{config?.voiceModel || 'Qwen3-TTS'}</strong>
            </span>
          </div>
          <p>
            한국어 음성을 먼저 만들고 장면별 영상을 생성한 뒤, 내보내기에서 음성,자막을 담은 MP4로 합칠 수
            있어요. 장면 이미지가 있으면 영상은 그 이미지에서 시작합니다. 영상 생성은 성능과 분량에 따라 수분
            이상 걸릴 수 있습니다.
          </p>
          <details>
            <summary>처음 사용하는 컴퓨터에서 준비하기</summary>
            <p>
              Apple Silicon Mac과 Python 3.11이 필요합니다. 아래 명령은 프로젝트 전용 실행 환경과 모델을
              설치합니다. 최초 다운로드에는 인터넷과 여유 저장 공간이 필요하며, 설치 후 생성은 오프라인으로
              실행합니다.
            </p>
            <code>yarn workspace @side/story-studio local:setup</code>
          </details>
          <div className="panel-actions">
            {config?.demoReady && <Link href="/studio?demo=1">이 컴퓨터에서 만든 애니메이션 열기 →</Link>}
            <button className="button secondary small" onClick={onRefresh}>
              모델 상태 다시 확인
            </button>
          </div>
        </>
      ) : (
        <>
          <p>
            클라우드 모드는 서버에 명시적으로 설정했을 때만 사용합니다. 싱가포르 Model Studio API 키를 앱의
            서버 환경에 설정해 주세요. 요청마다 외부 서비스 사용 요금이 발생합니다.
          </p>
          <div className="panel-actions">
            <a
              href="https://www.alibabacloud.com/help/en/model-studio/get-api-key"
              target="_blank"
              rel="noreferrer"
            >
              API 키 발급 안내 ↗
            </a>
            <button className="button secondary small" onClick={onRefresh}>
              연결 다시 확인
            </button>
          </div>
        </>
      )}
    </section>
  );
}
