import { Tabs, TabsContent, TabsList, TabsTrigger } from '@side/design-system';

import { isRecordDocument, receipt, recordIds, type TRecordDocument } from './case-file';
import { recordLabels, transferLedger, workCodes, workLog } from './case-records';

function TransferLedger() {
  return (
    <dl className="evidence-paper transfer-record">
      {transferLedger.map(({ serial, location, date }) => (
        <div key={serial}>
          <dt className="serial-code">{serial}</dt>
          <dd>
            {location}
            <small>{date} 이관</small>
          </dd>
        </div>
      ))}
    </dl>
  );
}

function NightLog() {
  return (
    <div className="evidence-paper">
      <table className="work-log" aria-label="야간 작업일지">
        <caption>{receipt.printDate} 야간 작업</caption>
        <thead>
          <tr>
            <th scope="col">시각</th>
            <th scope="col">기기 번호</th>
            <th scope="col">코드</th>
          </tr>
        </thead>
        <tbody>
          {workLog.map(({ id, at, serial, code }) => (
            <tr key={id}>
              <td>{at}</td>
              <td>{serial}</td>
              <td>{code}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WorkCodebook() {
  return (
    <dl className="evidence-paper code-book">
      {Object.entries(workCodes).map(([code, job]) => (
        <div key={code}>
          <dt className="serial-code">{code}</dt>
          <dd>{job.description}</dd>
        </div>
      ))}
    </dl>
  );
}

const recordContent = { ledger: TransferLedger, log: NightLog, codes: WorkCodebook };

export function RecordDocument({ document }: { document: TRecordDocument }) {
  const Content = recordContent[document];
  return <Content />;
}

interface IRecordEvidence {
  selected: TRecordDocument;
  viewed: readonly TRecordDocument[];
  onSelect: (document: TRecordDocument) => void;
}

export function RecordEvidence({ selected, viewed, onSelect }: IRecordEvidence) {
  return (
    <div className="evidence-body">
      <div className="record-heading">
        <h1>이관 기록</h1>
        <span aria-live="polite">
          {viewed.length}/{recordIds.length} 확인
        </span>
      </div>
      <Tabs
        className="record-tabs"
        value={selected}
        onValueChange={(value: unknown) => {
          if (isRecordDocument(value)) onSelect(value);
        }}
      >
        <TabsList variant="line" aria-label="기록 문서">
          {recordIds.map((id) => (
            <TabsTrigger key={id} value={id}>
              {recordLabels[id]}
            </TabsTrigger>
          ))}
        </TabsList>
        {recordIds.map((id) => (
          <TabsContent key={id} value={id} className="record-panel" hidden={selected !== id}>
            <RecordDocument document={id} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
