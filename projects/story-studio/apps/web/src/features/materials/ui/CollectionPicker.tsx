'use client';

import { useQuery } from '@tanstack/react-query';

import { trackStudioEvent } from '../../../shared/analytics';
import { materialOverviewQuery } from '../api/material-client';

// Chooses which material collections the local writer may consult for a work.
export function CollectionPicker({
  value,
  disabled = false,
  onChange,
}: {
  value: string[];
  disabled?: boolean;
  onChange: (collections: string[]) => void;
}) {
  const overview = useQuery(materialOverviewQuery);
  const names = (overview.data?.collections ?? []).map((collection) => collection.name);
  if (!names.length) return null;
  return (
    <div className="idea-row collection-picker" role="group" aria-label="참고 자료 묶음">
      <span>참고 자료</span>
      {names.map((name) => {
        const selected = value.includes(name);
        return (
          <button
            type="button"
            key={name}
            aria-pressed={selected}
            disabled={disabled || (!selected && value.length >= 8)}
            onClick={() => {
              // The collection name is the user's own text and is never sent.
              void trackStudioEvent('studio_collection_clicked', { action: selected ? 'clear' : 'select' });
              onChange(selected ? value.filter((item) => item !== name) : [...value, name]);
            }}
          >
            {name}
          </button>
        );
      })}
    </div>
  );
}
