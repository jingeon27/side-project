'use client';

import { useRef } from 'react';

import { Button, Input, type IButtonProps } from '@side/design-system';

type TFilePickerProps = Pick<IButtonProps, 'disabled' | 'icon' | 'size' | 'variant'> & {
  label: string;
  inputLabel?: string;
  accept: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
};

export function FilePickerButton({
  label,
  inputLabel = label,
  accept,
  multiple,
  onFiles,
  disabled,
  variant = 'secondary',
  size = 'md',
  icon,
}: TFilePickerProps) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        disabled={disabled}
        icon={icon}
        onClick={() => input.current?.click()}
      >
        {label}
      </Button>
      <Input
        ref={input}
        type="file"
        hidden
        disabled={disabled}
        multiple={multiple}
        accept={accept}
        aria-label={inputLabel}
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = '';
          if (files.length) onFiles(files);
        }}
      />
    </>
  );
}
