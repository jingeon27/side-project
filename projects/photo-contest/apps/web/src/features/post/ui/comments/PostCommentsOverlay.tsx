'use client';

import { useBackgroundQuery } from '@apollo/client/react';
import { useMedia } from 'react-use';

import { PostCommentsDocument } from '@/shared/api/generated';
import type { IOverlayControlProps } from '@/shared/lib/overlay.type';
import { useOverlayHistory } from '@/shared/model/router';

import { useCommentForm } from '../../model/comment-form.hook';
import { PostCommentsBottomSheet } from './PostCommentsBottomSheet';
import { PostCommentsModal } from './PostCommentsModal';

const PAGE_SIZE = 24;
const MODAL_WIDTH_QUERY = '(min-width: 768px)';

/**
 * 768px부터 모달, 그보다 좁으면 바텀시트를 보여 준다. 폭이 바뀌면 둘이 교체되므로
 * 조회와 입력 중인 댓글, history 항목은 여기서 소유해 이어 간다.
 */
export function PostCommentsOverlay({
  postId,
  isOpen,
  onClose,
  unmount,
}: IOverlayControlProps & { postId: string }) {
  const isModal = useMedia(MODAL_WIDTH_QUERY);
  const form = useCommentForm();
  const [commentsRef, { refetch }] = useBackgroundQuery(PostCommentsDocument, {
    variables: { postId, parentId: null, offset: 0, limit: PAGE_SIZE },
    fetchPolicy: 'network-only',
    refetchWritePolicy: 'overwrite',
  });
  useOverlayHistory(isOpen, onClose);
  const panel = { postId, commentsRef, onRetry: refetch, form, isOpen, onClose, unmount };
  return isModal ? <PostCommentsModal {...panel} /> : <PostCommentsBottomSheet {...panel} />;
}
