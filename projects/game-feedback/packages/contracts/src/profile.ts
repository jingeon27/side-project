import { z } from 'zod';

export const NicknameSchema = z
  .string()
  .trim()
  .min(2)
  .max(24)
  .regex(/^[\p{L}\p{N}_ .-]+$/u);
export const PROFILE_BIO_MAX_LENGTH = 500;
export const ProfileBioSchema = z.string().trim().max(PROFILE_BIO_MAX_LENGTH);
export const ProfileDetailsInputSchema = z
  .object({ nickname: NicknameSchema, bio: ProfileBioSchema })
  .strict();

export const UpdateProfileInputSchema = ProfileDetailsInputSchema.partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0);
