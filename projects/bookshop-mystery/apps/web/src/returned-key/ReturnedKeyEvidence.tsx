import { Moon, Square } from 'lucide-react';

import { envelopeImage, jobCodes, nightLog, returnSlots, stampColors, stampShapes } from './returned-key';

export function EnvelopeEvidence() {
  return (
    <section className="key-evidence" aria-labelledby="envelope-title">
      <h1 id="envelope-title">열쇠가 담긴 봉투</h1>
      <figure className="key-envelope">
        <img src={envelopeImage} alt="왼쪽 위에 파란 반달 자국이 찍힌 봉투" />
        <figcaption>봉투 모서리에 남은 자국을 확인해 보세요.</figcaption>
      </figure>
    </section>
  );
}

export function DropboxEvidence() {
  return (
    <section className="key-evidence" aria-labelledby="dropboxes-title">
      <h1 id="dropboxes-title">반납함의 표식</h1>
      <p>각 반납함은 투입한 봉투에 서로 다른 표식을 남겨요.</p>
      <ul className="key-dropboxes" role="list">
        {returnSlots.map(({ id, name, color, shape }) => {
          const Stamp = shape === 'crescent' ? Moon : Square;
          return (
            <li key={id}>
              <span className="key-stamp" data-color={color}>
                <Stamp aria-hidden="true" />
              </span>
              <div>
                <strong>{name}</strong>
                <p>
                  {stampColors[color]} {stampShapes[shape]}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function NightLogEvidence() {
  return (
    <section className="key-evidence" aria-labelledby="key-log-title">
      <h1 id="key-log-title">동명기록관 야간 일지</h1>
      <div className="key-records">
        <table aria-label="야간 일지">
          <thead>
            <tr>
              <th scope="col">시각</th>
              <th scope="col">코드</th>
              <th scope="col">확인 사항</th>
            </tr>
          </thead>
          <tbody>
            {nightLog.map(({ at, code, note }) => (
              <tr key={at}>
                <th scope="row">
                  <time>{at}</time>
                </th>
                <td>
                  <code>{code}</code>
                </td>
                <td>{note}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="key-codes" aria-labelledby="key-codes-title">
          <h2 id="key-codes-title">작업 코드</h2>
          <dl>
            {Object.entries(jobCodes).map(([code, { label }]) => (
              <div key={code}>
                <dt>
                  <code>{code}</code>
                </dt>
                <dd>{label}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </section>
  );
}
