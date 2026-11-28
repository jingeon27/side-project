import type { Metadata } from 'next';

import { SiteFooter } from '@/shared/ui/SiteFooter';

export const metadata: Metadata = { title: '개인정보 안내' };

export default function PrivacyPage() {
  return (
    <>
      <main id="main-content" className="site-width reading-width inner-page legal-page">
        <h1>개인정보 안내</h1>
        <section>
          <h2>사주 풀이</h2>
          <p>
            생년월일, 달력, 출생 시각은 기기에서 사주 원국을 계산할 때 사용해요. 서버 풀이에는 고른 이용
            유형과 고민, 일간의 오행을 전달해요. 과거 경험을 적으면 문장은 기기에 두고, 미리 정한 경험 주제 중
            관련 항목만 풀이에 사용해요. 벡터 DB에는 덕담집의 참고 자료와 정해진 선택지의 검색용 벡터를
            저장해요.
          </p>
        </section>
        <section>
          <h2>덕 기록과 공유</h2>
          <p>
            저장한 실천과 메모는 로그인한 계정의 기록장에 보관하며, 다른 기기에서도 볼 수 있어요. 기록장에서
            하나씩 지울 수 있어요. 공유 엽서에는 내가 고른 행동만 담겨요. 로그인 전 작성한 기록 초안은 이 탭에
            최대 15분 동안 보관해요. 예전 브라우저 기록은 직접 가져오기를 선택하면 계정에 저장돼요.
          </p>
        </section>
        <section>
          <h2>계정 로그인</h2>
          <p>
            Google 또는 카카오에서 받은 서비스별 식별자로 계정을 구분해요. 동의 화면을 거친 뒤 로그인 쿠키를
            발급하며, 로그아웃하거나 30일이 지나면 세션이 끝나요. 다른 로그인 방법을 선택하면 별도 기록장이
            열려요.
          </p>
        </section>
        <section>
          <h2>쇼츠 재생</h2>
          <p>쇼츠 플레이어 열기를 누르면 기기와 YouTube가 연결돼요.</p>
        </section>
        <section>
          <h2>광고, 결제, 이용 통계</h2>
          <p>
            광고는 성인이 추가 풀이 광고 버튼을 누를 때 불러와요. 결제 도입 시 주문 확인에는 로그인 계정의
            내부 식별자와 결제 번호를 사용해요. 통계 연동 시 공개 이야기, 이용 유형, 상품과 완료 여부를
            집계해요.
          </p>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
