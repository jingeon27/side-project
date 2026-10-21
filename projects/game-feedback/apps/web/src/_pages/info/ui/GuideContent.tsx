import type { TBoardKind } from '@game-feedback/contracts';
import { translate, type TLocale } from '@/shared/i18n/index.server';
import { ButtonLink } from '@side/design-system/next';
import { appRoutes } from '@game-feedback/bridge';
import { boardByKind, gameBoardPath } from '@/features/board';
import { GuideTitleLink } from './GuideTitleLink';

export function GuideContent({ locale }: { locale: TLocale }) {
  const t = (message: string) => translate(locale, message);
  return (
    <>
      <p className="info-lead">
        {t(
          '휴대폰에서 게시글을 찾고, 글을 올리고, 채팅하는 방법을 안내해요. 제목과 화살표를 누르면 해당 화면으로 바로 이동해요.',
        )}
      </p>
      <section className="guide-section">
        <h2>
          <GuideTitleLink href={appRoutes.feed(locale)}>{t('전체와 다섯 분류')}</GuideTitleLink>
        </h2>
        <p>
          {t(
            '화면 아래 홈을 누르면 모든 게임과 분류의 최신 글을 볼 수 있어요. 게임 이름 아래 분류 버튼을 좌우로 밀어 원하는 게시판을 선택하세요. 화면 위 검색 아이콘으로 글을 찾을 수 있어요. 공개 게시글·댓글·프로필은 로그인 없이 볼 수 있어요.',
          )}
        </p>
        <dl className="guide-board-list">
          <GuideBoardDescription kind="FEEDBACK" locale={locale} />
          <GuideBoardDescription kind="FRIEND_SALE" locale={locale} />
          <GuideBoardDescription kind="FRIENDLY" locale={locale} />
          <GuideBoardDescription kind="COACHING" locale={locale} />
          <GuideBoardDescription kind="FREE" locale={locale} />
        </dl>
      </section>
      <section className="guide-section">
        <h2>
          <GuideTitleLink href={appRoutes.compose(locale)}>{t('글쓰기와 사진·동영상')}</GuideTitleLink>
        </h2>
        <p>
          {t(
            '로그인한 뒤 글쓰기 버튼을 누르고 게임과 분류를 선택하세요. 제목과 본문을 입력하고, 사진·동영상 버튼으로 휴대폰의 파일을 첨부하거나 링크를 넣을 수 있어요. 분류를 바꿔도 입력한 제목과 본문은 유지돼요.',
          )}
        </p>
        <p>
          {t(
            '피드백에는 어려웠던 상황, 시도한 방법과 궁금한 점을 적어주세요. 다른 글에는 모집 조건이나 함께 나누고 싶은 이야기를 적으면 됩니다. 작성한 글은 본인이 수정하거나 삭제할 수 있습니다.',
          )}
        </p>
      </section>
      <section className="guide-section">
        <h2>
          <GuideTitleLink href={gameBoardPath(locale, 'FRIEND_SALE')}>{t('친추판매')}</GuideTitleLink>
        </h2>
        <p>
          {t(
            '친추판매는 판매 금액을 입력하고 이용 기간과 제공 내용을 본문에 적습니다. 금액을 비워두면 가격 협의로 표시됩니다.',
          )}
        </p>
      </section>
      <section className="guide-section">
        <h2>
          <GuideTitleLink href={gameBoardPath(locale, 'FRIENDLY')}>{t('전투 모집')}</GuideTitleLink>
        </h2>
        <p>
          {t(
            '전투 모집은 1:1 또는 팀전을 선택합니다. 가능한 시간, 규칙, 모집 인원과 참가 조건을 적어주세요. 목록의 전체·1:1·팀전 필터에서 원하는 모집만 볼 수 있습니다.',
          )}
        </p>
      </section>
      <section className="guide-section">
        <h2>
          <GuideTitleLink href={gameBoardPath(locale, 'COACHING')}>{t('코치와 수강생 모집')}</GuideTitleLink>
        </h2>
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
        <h2>
          <GuideTitleLink href={appRoutes.messages(locale)}>{t('채팅과 대화내역')}</GuideTitleLink>
        </h2>
        <p>
          {t(
            '게시글이나 상대 프로필의 채팅하기를 누르면 1:1 대화가 열려요. 화면 아래 채팅 메뉴에서 대화를 다시 찾을 수 있어요. 입력창 옆 첨부 버튼으로 사진·동영상을 고르고, 오른쪽 보내기 버튼을 눌러 전송하세요. 휴대폰 키보드의 줄바꿈은 메시지를 보내지 않고 다음 줄로 내려가요.',
          )}
        </p>
        <p>
          {t(
            '대화내역 삭제는 현재까지의 내 기록에만 적용됩니다. 상대의 기록과 이후 도착하는 메시지는 유지됩니다. 채팅 상단에서 상대를 신고하거나 메뉴에서 차단할 수 있습니다.',
          )}
        </p>
      </section>
      <section className="guide-section">
        <h2>
          <GuideTitleLink href={appRoutes.settings(locale)}>{t('게임 계정과 프로필 인증')}</GuideTitleLink>
        </h2>
        <p>
          {t(
            '화면 아래 프로필을 누르고 게임 계정의 계정 등록을 선택하세요. 플레이어 태그를 입력해 조회한 뒤 내 계정에 등록할 수 있어요. 등록한 게임 계정은 프로필에 연결되므로 글마다 따로 첨부할 필요가 없어요.',
          )}
        </p>
        <p>
          {t(
            '프로필 인증 신청은 관리자와의 비공개 1:1 채팅으로 연결됩니다. 관리자 확인 후 인증되며, 인증 전에도 글을 작성할 수 있습니다. 대표 태그를 바꾸면 다시 인증을 받아야 합니다.',
          )}
        </p>
      </section>
      <section className="guide-section">
        <h2>
          <GuideTitleLink href={appRoutes.notifications(locale)}>{t('팔로우와 새 소식')}</GuideTitleLink>
        </h2>
        <p>
          {t(
            '상대 프로필에서 팔로우하고 새 글 알림을 설정할 수 있어요. 화면 위 알림 아이콘을 누르면 새 답변·댓글과 구독한 사용자의 새 글을 확인할 수 있어요. 읽지 않은 메시지 수는 화면 아래 채팅 메뉴에 표시돼요.',
          )}
        </p>
        <p>{t('피드백 요청자는 도움이 된 답변에 도움됨을 표시할 수 있습니다.')}</p>
      </section>
      <section className="guide-section">
        <h2>
          <GuideTitleLink href={appRoutes.contact(locale)}>{t('문의와 신고')}</GuideTitleLink>
        </h2>
        <p>
          {t(
            '화면 아래 프로필에서 관리자 문의를 누르면 운영 문의와 프로필 인증을 상담할 수 있어요. 게시글·댓글·상대 프로필·채팅에서 신고를 선택하면 욕설·괴롭힘, 사칭, 사기·거래 피해 등을 접수할 수 있어요.',
          )}
        </p>
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
      <dt>
        <GuideTitleLink href={gameBoardPath(locale, kind)}>{translate(locale, board.name)}</GuideTitleLink>
      </dt>
      <dd>{translate(locale, board.description)}</dd>
    </div>
  );
}
