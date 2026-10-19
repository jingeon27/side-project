import 'server-only';
import { cache } from 'react';
import { listCategories } from '@game-feedback/sdk';
import { publicServerOptions } from '@/shared/api/server';
export const getPublicCategories = cache(() => listCategories(publicServerOptions()));
