import { ButtonLink } from '@side/design-system/next';
import { Gamepad2, MessageSquare, ShieldCheck, ArrowUpRight } from 'lucide-react';
export function GuideContent({ locale }: { locale: string }) {
  return (
    <>
      <p className="info-lead">
        완벽한 플레이보다, 조금 더 나아지는 플레이.
        <br />
        작은 경험과 다른 시선이 모이는 공간입니다.
      </p>
      <div className="guide-step">
        <span>01</span>
        <div>
          <h2>
            <Gamepad2 size={20} />
            나의 플레이를 연결해요
          </h2>
          <p>
            내 프로필에서 플레이어 태그를 조회하고 연결하세요. 프로필 인증은 관리자에게 신청할 수 있습니다.
          </p>
        </div>
      </div>
      <div className="guide-step">
        <span>02</span>
        <div>
          <h2>
            <MessageSquare size={20} />
            구체적으로 질문해요
          </h2>
          <p>
            현재 트로피, 어려운 상황과 시도해 본 방법을 적어주세요. 요청 작성 시 첨부한 프로필에는 플레이어
            태그, 트로피와 아레나가 표시됩니다.
          </p>
          <blockquote>
            “호그 2.6 덱으로 6,500점에서 플레이 중이에요. 페카를 상대할 때 엘릭서가 부족해집니다. 수비 후
            호그를 바로 내는 편인데, 운영을 어떻게 바꿔야 할까요?”
          </blockquote>
        </div>
      </div>
      <div className="guide-step">
        <span>03</span>
        <div>
          <h2>
            <ShieldCheck size={20} />
            경험을 나누고 마음을 전해요
          </h2>
          <p>
            제안의 이유를 함께 설명하면 더 좋은 피드백이 돼요. 요청자는 도움이 된 답변에 ‘도움이 됐어요’를
            표시할 수 있습니다. 새 답변은 인앱 알림함에서 확인하세요. 더 이야기하고 싶다면 작성자나 답변자의
            ‘채팅하기’에서 1:1 대화를 시작하세요. 채팅함에서 새 메시지와 읽음 상태를 확인할 수 있습니다.
          </p>
        </div>
      </div>
      <div className="info-callout">
        <strong>플레이를 이야기하고, 서로를 존중해요.</strong>
        <p>
          욕설, 비방, 광고, 개인정보 공개, 사칭은 허용되지 않아요. 문제가 있는 콘텐츠는 신고하고, 원치 않는
          사용자는 차단할 수 있습니다.
        </p>
      </div>
      <ButtonLink variant="primary" size="md" className="button dark" href={`/${locale}`}>
        이제 피드로 가볼까요?
        <ArrowUpRight size={16} />
      </ButtonLink>
    </>
  );
}
