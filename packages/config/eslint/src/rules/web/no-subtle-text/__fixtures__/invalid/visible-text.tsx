const captionClass = 'text-caption text-subtle';

function DraftStatus({ saved }: { saved: boolean }) {
  return (
    <>
      <p className="text-subtle">끌어서 높이를 바꿀 수 있어요.</p>
      <ChevronUp aria-hidden={false} className={`size-4 ${saved ? 'text-subtle' : 'text-muted'}`} />
      <span className={captionClass}>임시 저장됨</span>
    </>
  );
}
