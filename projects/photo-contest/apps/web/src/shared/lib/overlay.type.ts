/** overlay-kit `overlay.open(({ isOpen, close, unmount }) => ...)`이 넘겨주는 값을 받는 시트·대화상자 props */
export interface IOverlayControlProps {
  isOpen: boolean;
  /** 닫기(애니메이션 시작). 닫기 버튼·스와이프·Esc·뒤로 가기 모두 이것을 부른다. */
  onClose: () => void;
  /** 닫힘 애니메이션이 끝난 뒤 overlay-kit에서 지운다. overlay-kit 밖에서 쓰면 생략한다. */
  unmount?: () => void;
}
