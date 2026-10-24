'use client';

import { useEffect } from 'react';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { recordPostViewMutationOptions } from './post-view.mutation-options';

function visitorId() {
  try {
    const existing = sessionStorage.getItem('gf-post-visitor');
    if (existing && /^[a-f0-9-]{36}$/i.test(existing)) return existing;
    const id = crypto.randomUUID();
    sessionStorage.setItem('gf-post-visitor', id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

export function useRecordPostView(id: string, enabled: boolean, viewerId?: string) {
  const client = useQueryClient();
  const { mutate } = useMutation(recordPostViewMutationOptions(client));
  useEffect(() => {
    if (enabled) mutate({ id, visitorId: visitorId() });
  }, [id, enabled, viewerId, mutate]);
}
