import { wetMap, wetMapLog, wetMapMark, wetMapPlates } from './wet-map';

const notchLabels: Record<string, string> = { center: '가운데', right: '오른쪽' };

export function MapMarkEvidence() {
  return (
    <section className="wet-map-evidence" aria-labelledby="map-mark-title">
      <h1 id="map-mark-title">젖은 지도</h1>
      <figure>
        <img
          src={wetMapMark}
          alt={`젖은 지도 가운데에 가로 ${wetMap.mark.width}cm, 세로 ${wetMap.mark.height}cm의 마른 자국. 아래쪽 오른편으로 빗물이 둥글게 파고들었어요.`}
        />
        <figcaption>
          사진 촬영 <time>{wetMap.mark.foundAt}</time>. 당시 지도 위에는 아무것도 없었어요.
        </figcaption>
      </figure>
    </section>
  );
}

export function PlatesEvidence() {
  return (
    <section className="wet-map-evidence" aria-labelledby="plates-title">
      <h1 id="plates-title">안내대의 표찰 세 개</h1>
      <figure>
        <img src={wetMapPlates} alt="위쪽 방향을 맞춰 촬영한 표찰 세 개의 폭과 홈" />
        <figcaption>안내대에 있던 세 표찰의 방향을 맞춰 놓고 촬영했어요.</figcaption>
      </figure>
      <details className="wet-map-details">
        <summary>치수와 홈 위치 읽기</summary>
        <ul>
          {wetMap.plates.map(({ id, name, width, height, notch }) => (
            <li key={id}>
              {name} · {width} × {height}cm · 아래 {notchLabels[notch]}에 홈
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

export function WorkLogEvidence() {
  return (
    <section className="wet-map-evidence" aria-labelledby="work-log-title">
      <h1 id="work-log-title">선착장 작업 일지</h1>
      <p>지붕 없는 안내대에서 물건을 치운 시각을 모두 기록했어요.</p>
      <table aria-labelledby="work-log-title">
        <thead>
          <tr>
            <th scope="col">시각</th>
            <th scope="col">기록</th>
          </tr>
        </thead>
        <tbody>
          {wetMapLog.map(({ at, text }) => (
            <tr key={at}>
              <th scope="row">
                <time>{at}</time>
              </th>
              <td>{text}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
