import type { ComponentProps } from 'react';

import type { QueryRef } from '@apollo/client/react';

import type { PostCommentsQuery } from '@/shared/api/generated';
import type { IOverlayControlProps } from '@/shared/lib/overlay.type';
import type { AsyncBoundary } from '@/shared/ui/@core/async-boundary';

import type { TCommentForm } from '../../model/comment-form.hook';

/** 바텀시트와 모달이 함께 받는 값. 폭이 바뀌어 교체돼도 이어지도록 PostCommentsOverlay가 소유한다. */
export interface IPostCommentsPanelProps extends IOverlayControlProps {
  postId: string;
  commentsRef: QueryRef<PostCommentsQuery>;
  onRetry: ComponentProps<typeof AsyncBoundary>['onRetry'];
  form: TCommentForm;
}
