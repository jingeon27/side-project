import { ArrowUpRight } from 'lucide-react';

import { getContactEmail } from '@/shared/config';
import { translate, type TLocale } from '@/shared/i18n/index.server';

export function ContactContent({ locale }: { locale: TLocale }) {
  const t = (message: string) => translate(locale, message);
  const contact = getContactEmail();
  return (
    <>
      <p className="info-lead">{t('불편했던 점, 좋은 아이디어, 함께 만들어가고 싶은 이야기를 기다려요.')}</p>
      {contact ? (
        <div className="info-callout">
          <h2>{t('운영 문의')}</h2>
          <a className="contact-link" href={`mailto:${contact}`}>
            {contact}
            <ArrowUpRight size={18} />
          </a>
          <p>
            {t(
              '문제 상황과 발생 시간을 함께 알려주시면 확인에 도움이 됩니다. 비밀번호나 다른 사람의 개인정보는 보내지 마세요.',
            )}
          </p>
        </div>
      ) : (
        <div className="info-callout">
          <strong>{t('관리자와 비공개 채팅으로 문의하세요.')}</strong>
          <p>
            {t(
              '로그인 후 아래 문의 버튼을 누르면 관리자와 1:1 채팅을 시작합니다. 프로필 인증 요청도 같은 채팅에서 상담할 수 있습니다.',
            )}
          </p>
        </div>
      )}
      <h2>{t('커뮤니티 신고')}</h2>
      <p>
        {t(
          '게시글, 답변, 댓글과 사용자 프로필의 ‘신고’ 버튼으로 스팸, 괴롭힘, 사칭, 사기나 거래 피해를 접수할 수 있습니다. 원치 않는 사용자와는 ‘차단’ 기능을 이용하세요.',
        )}
      </p>
      <h2>{t('서비스 상태')}</h2>
      <p>{t('서비스 오류를 문의할 때는 문제가 발생한 화면과 시각을 함께 알려주세요.')}</p>
      <p className="muted small">{t('플레이메이트는 독립 프로젝트이며 게임의 공식 서비스가 아닙니다.')}</p>
    </>
  );
}
