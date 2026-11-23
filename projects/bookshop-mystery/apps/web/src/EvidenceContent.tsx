import { Printer, RotateCcw, RotateCw } from 'lucide-react';

import { Button } from '@side/design-system';

import { printerIds, printers, receipt, type TPrinter } from './case-file';

export function ReceiptFacts() {
  return (
    <dl className="evidence-paper receipt">
      <div>
        <dt>인쇄 일시</dt>
        <dd>
          <time dateTime={receipt.printDateTime}>
            {receipt.printDate} <strong>{receipt.printTime}</strong>
          </time>
        </dd>
      </div>
      <div>
        <dt>원거래 일시</dt>
        <dd>
          <time dateTime={receipt.tradeDateTime}>
            {receipt.tradeDate} <strong>{receipt.tradeTime}</strong>
          </time>
        </dd>
      </div>
      <div>
        <dt>기기 번호</dt>
        <dd>
          <strong className="serial-code">{receipt.serial}</strong>
        </dd>
      </div>
    </dl>
  );
}

export function ReceiptEvidence() {
  return (
    <div className="evidence-body">
      <h1>노을서점 거래 영수증</h1>
      <ReceiptFacts />
    </div>
  );
}

interface IPrinterEvidence {
  current: TPrinter;
  viewed: TPrinter[];
  underside: boolean;
  onChoose: (printer: TPrinter) => void;
}

export function PrinterEvidence({ current, viewed, underside, onChoose }: IPrinterEvidence) {
  return (
    <div className="evidence-body">
      <h1>프린터 두 대</h1>
      <div className="printer-compare" role="group" aria-label="조사할 프린터">
        {printerIds.map((id) => {
          const known = viewed.includes(id);
          return (
            <Button
              type="button"
              key={id}
              variant="secondary"
              className="printer-choice aria-pressed:border-accent-ink"
              aria-pressed={current === id}
              onClick={() => onChoose(id)}
            >
              <span>
                <Printer size={16} />
                {printers[id].name}
              </span>
              <strong className="serial-code" data-known={known}>
                {known ? printers[id].serial : '미확인'}
              </strong>
            </Button>
          );
        })}
      </div>
      <p className="sr-only" role="status">
        {underside ? `${printers[current].name} 밑면 번호 ${printers[current].serial}` : ''}
      </p>
    </div>
  );
}

interface IPrinterControls {
  underside: boolean;
  known: boolean;
  rotatable: boolean;
  onRotate: (x: number, y: number) => void;
  onFlip: () => void;
}

export function PrinterControls({ underside, known, rotatable, onRotate, onFlip }: IPrinterControls) {
  if (!rotatable && !known) return null;

  return (
    <div className="scene-controls" role="group" aria-label="프린터 조작">
      {rotatable && (
        <div className="turn-buttons" role="group" aria-label="프린터 회전">
          <Button
            type="button"
            variant="ghost"
            icon={<RotateCcw aria-hidden="true" />}
            onClick={() => onRotate(-24, 0)}
          >
            왼쪽 회전
          </Button>
          <Button
            type="button"
            variant="ghost"
            icon={<RotateCw aria-hidden="true" />}
            onClick={() => onRotate(24, 0)}
          >
            오른쪽 회전
          </Button>
        </div>
      )}
      {known && (
        <Button className="scene-face-action" type="button" variant="secondary" onClick={onFlip}>
          {underside ? '윗면 보기' : '밑면 보기'}
        </Button>
      )}
    </div>
  );
}
