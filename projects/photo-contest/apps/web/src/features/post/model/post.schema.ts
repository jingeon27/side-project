import { z } from 'zod';

export const postSchema = z.object({
  title: z.string().trim().min(1, '제목을 입력해 주세요.').max(80, '80자 이내로 입력해 주세요.'),
  body: z.string().trim().max(5000, '5000자 이내로 입력해 주세요.'),
  media: z
    .instanceof(File)
    .nullable()
    .transform((file, context) => {
      if (file) return file;
      context.addIssue({ code: 'custom', message: '사진이나 동영상을 선택해 주세요.' });
      return z.NEVER;
    })
    .refine((file) => file.size <= 100 * 1024 * 1024, '100MB 이하로 선택해 주세요.')
    .refine(
      (file) => file.type.startsWith('image/') || ['video/mp4', 'video/webm'].includes(file.type),
      '사진 또는 MP4·WebM 동영상을 선택해 주세요.',
    ),
  rightsConfirmed: z.boolean().refine((value) => value, '공유할 권리와 촬영된 사람의 동의를 확인해 주세요.'),
});
