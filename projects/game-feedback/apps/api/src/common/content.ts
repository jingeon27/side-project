import { BoardKindSchema } from '@game-feedback/contracts';

export const ACTIVE_CONTENT = { hidden: false, deletedAt: null } as const;
export const ACTIVE_POST = { ...ACTIVE_CONTENT, board: { in: BoardKindSchema.options } };
