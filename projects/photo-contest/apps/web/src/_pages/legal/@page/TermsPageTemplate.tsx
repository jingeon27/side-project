import Link from 'next/link';

import { ROUTES } from '@/shared/constants/routes';

import { LegalPageLayout } from './ui/LegalPageLayout';
import { LegalSection } from './ui/LegalSection';
import { PolicyContact } from './ui/PolicyContact';

export function TermsPageTemplate() {
  return (
    <LegalPageLayout title="이용약관">
      <LegalSection id="terms-service" title="1. 서비스와 이용 범위">
        <p>
          웃긴순간은 초대로 참여한 그룹에서 사진·동영상·합성 이미지와 글·댓글을 나누는 서비스입니다. 이 약관은
          운영자와 이용자 사이의 서비스 이용에 관한 기본 사항을 안내합니다.
        </p>
        <p>현재 기본 서비스는 무료이며, 유료 기능을 제공하는 경우 가격과 이용 조건을 별도로 안내합니다.</p>
      </LegalSection>
      <LegalSection id="terms-account" title="2. 계정과 로그인">
        <p>
          이용자는 직접 정한 아이디·비밀번호 또는 제공되는 소셜 로그인으로 계정을 이용합니다. 계정과 로그인
          수단을 안전하게 관리하고 다른 사람의 계정을 도용하거나 사칭해서는 안 됩니다.
        </p>
        <p>다른 기기와 계정을 공유했다면 사용 후 로그아웃하고, 도용이 의심되면 운영자에게 알려 주세요.</p>
      </LegalSection>
      <LegalSection id="terms-groups" title="3. 그룹과 공개 범위">
        <p>
          그룹 게시물은 해당 그룹에 가입한 멤버에게 공개됩니다. 초대 링크를 받은 사람은 로그인 후 그룹에
          가입할 수 있으므로 링크를 신뢰하는 사람에게만 전달해 주세요. 새로 가입한 멤버도 기존 게시물을 볼 수
          있습니다.
        </p>
        <p>
          그룹 관리자는 그룹의 게시물과 댓글을 삭제할 수 있습니다. 멤버가 사진을 저장하거나 화면을 캡처해
          외부로 전달하는 행위까지 서비스가 완전히 통제할 수는 없습니다.
        </p>
      </LegalSection>
      <LegalSection id="terms-content" title="4. 게시물의 권리와 이용">
        <p>
          게시물의 저작권은 원래 권리자에게 있습니다. 이용자는 공유할 권리가 있는 콘텐츠를 올리고, 촬영된
          사람의 초상권·개인정보와 다른 사람의 저작권을 존중해야 합니다. 합성 콘텐츠도 같은 원칙을 따릅니다.
        </p>
        <p>
          운영자는 게시물의 저장·화면 표시·파일 변환·그룹 내 공유 등 서비스 제공에 필요한 범위에서만 콘텐츠를
          처리합니다. 이 약관으로 게시물의 소유권이 운영자에게 이전되지는 않습니다.
        </p>
      </LegalSection>
      <LegalSection id="terms-conduct" title="5. 함께 지켜야 할 사항">
        <ul className="list-disc space-y-2 pl-5">
          <li>동의 없는 개인정보·사생활 공개, 불법 촬영물과 성적 합성물의 등록·유포를 금지합니다.</li>
          <li>괴롭힘·협박·혐오·사칭, 저작권 침해와 불법 광고를 금지합니다.</li>
          <li>서비스나 계정의 보안을 침해하거나 자동화된 요청으로 정상 이용을 방해해서는 안 됩니다.</li>
        </ul>
        <p>
          권리 침해나 불법 콘텐츠가 확인되면 필요한 범위에서 게시물 삭제 또는 이용 제한 등의 조치를 할 수
          있습니다. 조치에 대한 의견이나 이의는 운영자에게 전달할 수 있습니다.
        </p>
      </LegalSection>
      <LegalSection id="terms-deletion" title="6. 삭제와 이용 종료">
        <p>
          작성자는 제공되는 삭제 기능으로 자신의 게시물·댓글을 삭제할 수 있습니다. 계정 탈퇴나 화면에서 처리할
          수 없는 삭제 요청은 운영자 이메일로 접수할 수 있습니다. 요청자를 확인한 뒤 관련 법령과 개인정보
          처리방침에 따라 처리합니다.
        </p>
        <p>게시물 삭제 전 필요한 원본을 보관해 주세요. 다른 이용자가 이미 저장한 사본은 남을 수 있습니다.</p>
      </LegalSection>
      <LegalSection id="terms-changes" title="7. 서비스 변경과 책임">
        <p>
          점검·장애 또는 운영상의 사유로 서비스가 변경되거나 일시 중단될 수 있습니다. 예정된 중요한 변경은
          가능한 한 미리 안내하고, 이용자의 권리에 영향을 주는 약관 변경은 적용 전에 변경 내용과 적용일을
          알립니다. 법령상 동의가 필요한 경우 별도 절차를 거칩니다.
        </p>
        <p>
          운영자와 이용자의 책임은 관계 법령에 따릅니다. 이 약관은 운영자의 고의·중대한 과실에 따른 책임이나
          이용자의 법률상 권리를 배제하지 않습니다. 분쟁의 관할은 관련 법령에 따릅니다.
        </p>
      </LegalSection>
      <LegalSection id="terms-contact" title="8. 개인정보와 문의">
        <p>
          개인정보 처리에 관한 자세한 사항은{' '}
          <Link href={ROUTES.PRIVACY} className="text-ink underline underline-offset-4">
            개인정보 처리방침
          </Link>
          에서 확인할 수 있습니다. 서비스 이용, 권리 침해, 계정 탈퇴 또는 약관에 관한 문의는 아래로 보내
          주세요.
        </p>
        <PolicyContact />
      </LegalSection>
    </LegalPageLayout>
  );
}
