import { z } from 'zod';

export const ProfileLinkSchema = z
  .object({
    label: z.string().trim().min(1).max(40),
    url: z
      .string()
      .trim()
      .url()
      .max(2048)
      .regex(/^https?:\/\/\S+$/i)
      .refine((value) => {
        const url = new URL(value);
        return !url.username && !url.password && ['https:', 'http:'].includes(url.protocol);
      }, 'HTTP(S) 링크를 입력해주세요. 주소에 계정 정보는 넣을 수 없습니다.'),
  })
  .strict();
export const ProfileLinksSchema = z.array(ProfileLinkSchema).max(5);
export const UpdateProfileInputSchema = z.object({ links: ProfileLinksSchema }).strict();
