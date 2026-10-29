export type TStyledProps<TProps> = Omit<TProps, 'className'> & { className?: string };
