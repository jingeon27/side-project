import { z } from 'zod';

export function getContactEmail() {
  const configured = z.email().safeParse(process.env.NEXT_PUBLIC_GAME_FEEDBACK_CONTACT_EMAIL?.trim());
  return configured.success ? configured.data : 'contact@bambyul.com';
}
