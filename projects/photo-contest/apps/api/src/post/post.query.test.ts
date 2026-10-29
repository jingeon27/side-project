import { describe, expect, it } from 'vitest';

import { USER_VIEW_SELECT } from '../auth/user-view';
import { postInclude } from './post.query';

describe('postInclude', () => {
  it('작성자는 응답에 쓰는 공개 열만 골라야 한다', () => {
    // provider·providerId 같은 계정 식별자까지 읽어 오던 회귀를 막는다.
    expect(postInclude(null).author).toEqual({ select: USER_VIEW_SELECT });
    expect(postInclude('viewer').author).toEqual({ select: USER_VIEW_SELECT });
  });
});
