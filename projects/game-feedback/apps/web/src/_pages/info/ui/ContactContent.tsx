import { ArrowUpRight } from 'lucide-react';
export function ContactContent() {
  const contact = process.env.GAME_FEEDBACK_CONTACT_EMAIL;
  return (
    <>
      <p className="info-lead">불편했던 점, 좋은 아이디어, 함께 만들어가고 싶은 이야기를 기다려요.</p>
      {contact ? (
        <div className="info-callout">
          <h2>운영 문의</h2>
          <a className="contact-link" href={`mailto:${contact}`}>
            {contact}
            <ArrowUpRight size={18} />
          </a>
          <p>
            문제 상황과 발생 시간을 함께 알려주시면 확인에 도움이 됩니다. 비밀번호나 다른 사람의 개인정보는
            보내지 마세요.
          </p>
        </div>
      ) : (
        <div className="info-callout">
          <strong>아직 공개 문의 창구가 설정되지 않았어요.</strong>
          <p>
            현재는 비공개 알파 환경입니다. 참여를 안내한 프로젝트 운영자에게 직접 연락해주세요. 공개 이용자
            모집 전 운영자 정보와 문의 이메일을 확정해야 합니다.
          </p>
        </div>
      )}
      <h2>커뮤니티 신고</h2>
      <p>
        게시글, 답변, 댓글의 ‘신고’ 버튼으로 스팸, 괴롭힘, 사칭, 개인정보 노출을 접수할 수 있습니다. 원치 않는
        사용자와는 ‘차단’ 기능을 이용하세요.
      </p>
      <h2>서비스 상태</h2>
      <p>
        한국어 우선 비공개 알파로 개발 중입니다. 외부 게임 API와 Google 인증은 운영 환경의 별도 설정이
        필요합니다. 실제 외부 연동과 예시 데이터를 사용하는 데모 환경은 구분해서 표시합니다.
      </p>
      <p className="muted small">플레이메이트는 독립 프로젝트이며 게임의 공식 서비스가 아닙니다.</p>
    </>
  );
}
