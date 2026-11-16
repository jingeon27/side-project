function EmptyNotifications({ active }: { active: boolean }) {
  return (
    <div className="text-muted">
      <Heart aria-hidden className="size-8 text-subtle" />
      <ArrowUpRight aria-hidden="true" className={cn('size-4 text-subtle', active && 'text-accent-ink')} />
      <ChevronRight aria-hidden={true} className={`size-4 ${active ? 'text-ink' : 'text-subtle'}`} />
      <textarea aria-label="댓글" className="placeholder:text-muted" placeholder="댓글을 남겨보세요." />
    </div>
  );
}
