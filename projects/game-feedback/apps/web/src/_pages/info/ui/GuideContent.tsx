import { appRoutes } from '@game-feedback/bridge';
import type { TBoardKind } from '@game-feedback/contracts';
import { ButtonLink } from '@side/design-system/next';

import { boardByKind, gameBoardPath } from '@/features/board';
import { translate, type TLocale } from '@/shared/i18n/index.server';

export function GuideContent({ locale }: { locale: TLocale }) {
  const t = (message: string) => translate(locale, message);
  return (
    <>
      <p className="info-lead">
        {t('게시글을 찾고, 모집 글을 올리고, 채팅으로 이야기하는 방법을 안내합니다.')}
      </p>
      <section className="guide-section">
        <h2>{t('전체와 다섯 분류')}</h2>
        <p>
          {t(
            '홈의 전체에서는 모든 분류의 최신 글을 볼 수 있습니다. 게임 이름 아래 칩에서 분류를 선택하고, 헤더의 검색 아이콘으로 검색 페이지를 열 수 있습니다. 공개 게시글과 댓글, 사용자 프로필은 로그인 없이 읽을 수 있습니다.',
          )}
        </p>
        <dl className="guide-board-list">
          <GuideBoardDescription kind="FEEDBACK" locale={locale} />
          <GuideBoardDescription kind="FRIEND_SALE" locale={locale} />
          <GuideBoardDescription kind="FRIENDLY" locale={locale} />
          <GuideBoardDescription kind="COACHING" locale={locale} />
          <GuideBoardDescription kind="FREE" locale={locale} />
        </dl>
        <nav className="guide-board-links" aria-label={t('분류별 바로가기')}>
          <ButtonLink variant="secondary" size="sm" href={appRoutes.feed(locale)}>
            {t('전체')}
          </ButtonLink>
          <GuideBoardLink kind="FEEDBACK" locale={locale} />
          <GuideBoardLink kind="FRIEND_SALE" locale={locale} />
          <GuideBoardLink kind="FRIENDLY" locale={locale} />
          <GuideBoardLink kind="COACHING" locale={locale} />
          <GuideBoardLink kind="FREE" locale={locale} />
        </nav>
      </section>
      <section className="guide-section">
        <h2>{t('글쓰기와 사진·동영상')}</h2>
        <p>
          {t(
            '로그인 후 글쓰기를 누르고 게임과 분류를 선택하세요. 분류를 바꿔도 입력한 제목과 본문은 유지됩니다. 본문 편집기의 사진·동영상 버튼으로 파일을 넣고, 서식과 링크도 함께 작성할 수 있습니다.',
          )}
        </p>
        <p>
          {t(
            '피드백에는 어려웠던 상황, 시도한 방법과 궁금한 점을 적어주세요. 다른 글에는 모집 조건이나 함께 나누고 싶은 이야기를 적으면 됩니다. 작성한 글은 본인이 수정하거나 삭제할 수 있습니다.',
          )}
        </p>
      </section>
      <section className="guide-section">
        <h2>{t('친추판매와 전투 모집')}</h2>
        <p>
          {t(
            '친추판매는 판매 금액을 입력하고 이용 기간과 제공 내용을 본문에 적습니다. 금액을 비워두면 가격 협의로 표시됩니다.',
          )}
        </p>
        <p>
          {t(
            '전투 모집은 1:1 또는 팀전을 선택합니다. 가능한 시간, 규칙, 모집 인원과 참가 조건을 적어주세요. 목록의 전체·1:1·팀전 필터에서 원하는 모집만 볼 수 있습니다.',
          )}
        </p>
      </section>
      <section className="guide-section">
        <h2>{t('코치와 수강생 모집')}</h2>
        <p>
          {t(
            '가르치는 사람은 수강생 모집, 배우려는 사람은 코치 구함을 선택합니다. 게임코치 목록에서도 같은 모집 유형으로 글을 골라볼 수 있습니다.',
          )}
        </p>
        <p>
          {t(
            '수강료는 시간당, 월 단위, 목표 점수 달성까지 중에서 선택합니다. 목표 달성형에는 목표 점수와 달성까지의 총수강료를 적습니다. 금액을 비워두면 수강료 협의로 표시됩니다.',
          )}
        </p>
        <p>
          {t(
            '코칭 상담 버튼으로 상대와 1:1 채팅을 시작하고 수업 방식, 일정과 비용을 정하세요. 서비스에서는 결제와 정산을 처리하지 않습니다.',
          )}
        </p>
      </section>
      <section className="guide-section">
        <h2>{t('채팅과 대화내역')}</h2>
        <p>
          {t(
            '게시글이나 사용자 프로필의 채팅하기에서 대화를 시작합니다. 채팅에서는 사진·동영상과 텍스트를 보낼 수 있습니다. 데스크톱 Enter는 전송, Shift+Enter는 줄바꿈이며 모바일 Enter는 줄바꿈입니다.',
          )}
        </p>
        <p>
          {t(
            '대화내역 삭제는 현재까지의 내 기록에만 적용됩니다. 상대의 기록과 이후 도착하는 메시지는 유지됩니다. 채팅 상단에서 상대를 신고하거나 메뉴에서 차단할 수 있습니다.',
          )}
        </p>
      </section>
      <section className="guide-section">
        <h2>{t('게임 계정과 프로필 인증')}</h2>
        <p>
          {t(
            '프로필의 게임 계정에서 플레이어 태그를 조회하고 내 계정에 등록하세요. 게임 계정은 사용자 계정에 연결하며 게시글에 별도로 첨부하지 않습니다.',
          )}
        </p>
        <p>
          {t(
            '프로필 인증 신청은 관리자와의 비공개 1:1 채팅으로 연결됩니다. 관리자 확인 후 인증되며, 인증 전에도 글을 작성할 수 있습니다. 대표 태그를 바꾸면 다시 인증을 받아야 합니다.',
          )}
        </p>
        <ButtonLink variant="secondary" size="sm" href={appRoutes.settings(locale)}>
          {t('프로필에서 계정 등록하기')}
        </ButtonLink>
      </section>
      <section className="guide-section">
        <h2>{t('팔로우와 새 소식')}</h2>
        <p>
          {t(
            '사용자 프로필에서 팔로우하고 새 글 알림을 설정할 수 있습니다. 새 답변·댓글과 구독한 사용자의 새 글은 헤더의 알림에서 확인하세요. 읽지 않은 채팅은 하단 채팅 메뉴에 개수로 표시됩니다.',
          )}
        </p>
        <p>{t('피드백 요청자는 도움이 된 답변에 도움됨을 표시할 수 있습니다.')}</p>
      </section>
      <section className="guide-section">
        <h2>{t('문의와 신고')}</h2>
        <p>
          {t(
            '운영 문의와 프로필 인증은 프로필의 관리자 문의에서 상담할 수 있습니다. 게시글·댓글·프로필·채팅의 신고 기능으로 욕설·괴롭힘, 사칭, 사기·거래 피해 등을 접수할 수 있습니다.',
          )}
        </p>
        <ButtonLink variant="secondary" size="sm" href={appRoutes.contact(locale)}>
          {t('문의 안내 보기')}
        </ButtonLink>
      </section>
      <ButtonLink variant="primary" size="md" href={appRoutes.feed(locale)}>
        {t('홈으로 이동')}
      </ButtonLink>
    </>
  );
}

function GuideBoardDescription({ kind, locale }: { kind: TBoardKind; locale: TLocale }) {
  const board = boardByKind(kind);
  if (!board) return null;
  return (
    <div>
      <dt>{translate(locale, board.name)}</dt>
      <dd>{translate(locale, board.description)}</dd>
    </div>
  );
}
function GuideBoardLink({ kind, locale }: { kind: TBoardKind; locale: TLocale }) {
  const board = boardByKind(kind);
  if (!board) return null;
  return (
    <ButtonLink variant="secondary" size="sm" href={gameBoardPath(locale, kind)}>
      {translate(locale, board.name)}
    </ButtonLink>
  );
}
