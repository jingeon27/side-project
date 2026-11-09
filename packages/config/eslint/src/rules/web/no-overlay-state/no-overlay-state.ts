import type { TSESLint } from '@typescript-eslint/utils';

import { visitStateNames } from '../state-name.helper';

const OVERLAY = '(?:[a-z]*(?:sheet|modal|dialog|drawer|popup|popover|overlay|alert|confirm|lightbox))';
// 메뉴·아코디언 같은 화면 안 토글(menuOpen)은 오버레이가 아니다. 이름 없는 open·visible이나 오버레이 명사만 본다.
const OPEN_STATE = new RegExp(`^(?:is)?${OVERLAY}?(?:open|opened|visible|shown)$`, 'i');
const SHOW_STATE = new RegExp(`^show${OVERLAY}?$`, 'i');

export const noOverlayState: TSESLint.RuleModule<'overlayState', []> = {
  defaultOptions: [],
  meta: {
    type: 'problem',
    docs: { description: 'useState로 관리하는 오버레이 열림 상태를 검사한다.' },
    schema: [],
    messages: { overlayState: '열림 상태는 overlay.open과 시트 props로 처리하세요.' },
  },
  create(context) {
    return visitStateNames(context, (name) => OPEN_STATE.test(name) || SHOW_STATE.test(name), 'overlayState');
  },
};
