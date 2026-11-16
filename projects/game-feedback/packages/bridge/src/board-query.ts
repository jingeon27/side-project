import { z } from 'zod';

export const GameSlugSchema = z
  .string()
  .regex(/^[a-z0-9-]+$/)
  .max(40);
export const BoardSlugSchema = z.enum(['feedback', 'friend-sale', 'friendly', 'coaching', 'free']);
export const BattleModeSchema = z.enum(['DUEL', 'TEAM']);
export const CoachingRoleSchema = z.enum(['COACH', 'STUDENT']);
export const FeedbackStatusSchema = z.enum(['WAITING', 'ANSWERED']);

export const BoardQuerySchema = z
  .object({
    board: BoardSlugSchema.optional(),
    game: GameSlugSchema.prefault('clash-royale'),
    battleMode: BattleModeSchema.optional(),
    coachingRole: CoachingRoleSchema.optional(),
    feedbackStatus: FeedbackStatusSchema.optional(),
  })
  .refine(({ board, battleMode }) => !battleMode || board === 'friendly', { path: ['battleMode'] })
  .refine(({ board, coachingRole }) => !coachingRole || board === 'coaching', { path: ['coachingRole'] })
  .refine(({ board, feedbackStatus }) => !feedbackStatus || board === 'feedback', {
    path: ['feedbackStatus'],
  });
