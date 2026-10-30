import { z } from 'zod';

import { validPostLink } from '@/features/post';
import { isImageFile } from '@/shared/lib/image.helper';

export const postSchema = z
  .object({
    categoryId: z.string().default(''),
    participateInContest: z.boolean().default(false),
    contestId: z.string().default(''),
    title: z.string().trim().min(1, '제목을 입력해 주세요.').max(80, '80자 이내로 입력해 주세요.'),
    body: z.string().trim().max(5000, '5000자 이내로 입력해 주세요.'),
    linkUrl: z
      .string()
      .trim()
      .default('')
      .refine(validPostLink, 'http:// 또는 https://로 시작하는 링크를 입력해 주세요.'),
    media: z
      .instanceof(File)
      .nullable()
      .refine((file) => !file || file.size <= 100 * 1024 * 1024, '100MB 이하로 선택해 주세요.')
      .refine(
        (file) => !file || isImageFile(file) || ['video/mp4', 'video/webm'].includes(file.type),
        '사진이나 MP4, WebM 형식의 동영상을 선택해 주세요.',
      ),
    rightsConfirmed: z
      .boolean()
      .refine((value) => value, '공유할 권리와 촬영된 사람의 동의를 확인해 주세요.'),
  })
  .refine((value) => Boolean(value.media || value.linkUrl), {
    path: ['media'],
    message: '사진이나 동영상, 링크를 하나 이상 첨부해 주세요.',
  })
  .refine((value) => !value.participateInContest || value.contestId.trim().length > 0, {
    path: ['contestId'],
    message: '참여할 대회를 선택해 주세요.',
  });

export type TPostInput = z.input<typeof postSchema>;
export type TPostValues = z.output<typeof postSchema>;
