import { BookOpen } from 'lucide-react';

import {
  Button,
  DialogContent,
  DialogHeader,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
  Disclosure,
  DisclosureTrigger,
} from '@side/design-system';

import { trackEvent } from './analytics';
import { printers, recordIds, type IProgress, type TCaseStep } from './case-file';
import { recordLabels } from './case-records';
import { ReceiptFacts } from './EvidenceContent';
import { RecordDocument } from './RecordEvidence';

interface IEvidenceNotebook {
  step: TCaseStep;
  progress: IProgress;
}

export function EvidenceNotebook({ step, progress }: IEvidenceNotebook) {
  const documents = recordIds.filter((id) => progress.recordDocuments.includes(id));
  const entries = [
    {
      id: 'receipt',
      label: '거래 영수증',
      viewed: progress.clues.includes('receipt'),
      evidence: <ReceiptFacts />,
    },
    {
      id: 'printers',
      label: '프린터 기기 번호',
      viewed: progress.viewedBottoms.length > 0,
      evidence: (
        <dl className="evidence-paper">
          {progress.viewedBottoms.map((id) => (
            <div key={id}>
              <dt>{printers[id].name}</dt>
              <dd className="serial-code">{printers[id].serial}</dd>
            </div>
          ))}
        </dl>
      ),
    },
    ...documents.map((id) => ({
      id,
      label: recordLabels[id],
      viewed: true,
      evidence: <RecordDocument document={id} />,
    })),
  ] as const;
  const visibleEntries = entries.filter((entry) => entry.viewed);

  return (
    <DialogRoot
      onOpenChange={(open) => {
        if (open)
          void trackEvent('case_notebook_opened', { from_step: step, item_count: visibleEntries.length });
      }}
    >
      <DialogTrigger
        render={<Button variant="ghost" className="notebook-trigger" aria-label="증거 수첩" type="button" />}
      >
        <BookOpen aria-hidden="true" />
        수첩
      </DialogTrigger>
      <DialogContent className="evidence-notebook" closeLabel="수첩 닫기">
        <DialogHeader className="notebook-heading">
          <DialogTitle>증거 수첩</DialogTitle>
        </DialogHeader>
        <div className="notebook-entries">
          {!visibleEntries.length && <p>조사한 자료가 여기에 모여요.</p>}
          {visibleEntries.map(({ id, label, evidence }) => (
            <Disclosure
              key={id}
              className="notebook-entry"
              onToggle={(event) => {
                if (event.currentTarget.open) void trackEvent('case_notebook_item_opened', { item_id: id });
              }}
            >
              <DisclosureTrigger>{label}</DisclosureTrigger>
              {evidence}
            </Disclosure>
          ))}
        </div>
      </DialogContent>
    </DialogRoot>
  );
}
