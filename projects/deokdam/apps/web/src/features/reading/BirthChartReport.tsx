import type { IChart } from './chart';
import type { TBirthInput } from './contracts';
import { elementDescriptions } from './interpretation';

const stems: Record<string, string> = {
  갑: '큰 나무가 줄기를 세우는 모습에 빗대요. 여러 선택 앞에서 무엇을 중심에 둘지 생각해 볼 수 있어요.',
  을: '덩굴과 풀이 자리를 찾아 뻗는 모습에 빗대요. 한 번에 길을 정하기 어려울 때 방향을 조금 바꿔보는 장면이에요.',
  병: '햇빛이 주변을 밝히는 모습에 빗대요. 머릿속에만 있던 생각을 말로 꺼내 누군가와 함께 보는 장면이에요.',
  정: '등불이 가까운 자리를 비추는 모습에 빗대요. 많은 일을 한꺼번에 살피기 힘들 때 내 앞의 한 가지를 골라봐요.',
  무: '산과 넓은 땅에 빗대요. 흔들리는 날에도 이미 쌓아온 일과 나를 받쳐주는 사람을 떠올려 보는 장면이에요.',
  기: '씨앗을 돌보는 밭에 빗대요. 한 번으로 끝나지 않는 일에서 조금씩 달라지는 지점을 살펴봐요.',
  경: '형태를 갖춰 가는 쇠에 빗대요. 막연했던 계획에서 꼭 필요한 뼈대를 남기는 장면이에요.',
  신: '작은 금속을 다듬는 모습에 빗대요. 이미 해낸 일에서 마음에 걸리는 부분 하나를 골라 손봐요.',
  임: '여러 물줄기가 합쳐지는 큰물에 빗대요. 익숙한 방법이 막히면 다른 사람의 관점을 들어보는 장면이에요.',
  계: '흙 속으로 스며드는 빗물에 빗대요. 겉으로 드러나지 않은 변화도 한 줄씩 적어가며 살펴봐요.',
};
const seasons = [
  {
    branches: '인묘진',
    name: '봄',
    text: '시작하고 자라는 시절이에요. 요즘 처음 해본 일에서 다음에도 살려보고 싶은 점을 찾아보세요.',
  },
  {
    branches: '사오미',
    name: '여름',
    text: '움직임이 겉으로 드러나는 시절이에요. 내가 한 일을 다른 사람이 알아들을 수 있게 한 장면으로 설명해 보세요.',
  },
  {
    branches: '신유술',
    name: '가을',
    text: '기른 것을 거두고 가르는 시절이에요. 이어가고 싶은 일 하나와 잠시 덜어낼 일 하나를 나란히 놓아보세요.',
  },
  {
    branches: '해자축',
    name: '겨울',
    text: '다음 움직임을 준비하는 시절이에요. 기다리는 동안 정리해 두면 마음이 편해질 것을 한 가지 골라보세요.',
  },
];
export function BirthChartReport({ chart, birth }: { chart: IChart; birth: TBirthInput }) {
  const date = birth.date.replaceAll('-', '').replace(/^(\d{4})(\d{2})(\d{2})$/, '$1년 $2월 $3일');
  const stem = chart.day.charAt(0);
  const branch = chart.month?.charAt(1);
  const season = branch && seasons.find((item) => item.branches.includes(branch));
  return (
    <section className="chart-report" aria-labelledby="chart-title">
      <header>
        <p className="label">나의 만세력</p>
        <h2 id="chart-title">내 생일을 네 기둥으로 읽으면</h2>
        <p className="chart-birth">
          {birth.calendar === 'solar' ? '양력' : birth.leapMonth ? '음력 윤달' : '음력'} {date} ·{' '}
          {birth.time ? '한국 시각 ' + birth.time : '출생 시각 미상'}
        </p>
      </header>
      <dl className="chart-pillars" aria-label="사주의 네 기둥">
        {[
          { label: '년주', name: '태어난 해', value: chart.year },
          { label: '월주', name: '태어난 달', value: chart.month },
          { label: '일주', name: '태어난 날', value: chart.day },
          { label: '시주', name: '태어난 시각', value: chart.time },
        ].map((pillar) => (
          <div key={pillar.label} data-day={pillar.label === '일주' || undefined}>
            <dt>{pillar.label}</dt>
            <dd>{pillar.value ?? '미상'}</dd>
            <dd>{pillar.name}</dd>
          </div>
        ))}
      </dl>
      <p>
        년주는 입춘을, 월주는 절기가 바뀌는 때를 기준으로 읽어요. 일주는 태어난 날의 두 글자이고, 시주는
        하루를 두 시간씩 나눈 구간과 그날의 일간으로 정해요.
      </p>
      <h3>나를 나타내는 첫 글자, {stem}</h3>
      <p>
        일주 ‘{chart.day}’의 첫 글자가 일간이에요. 전통 명리에서는 ‘{stem}’을{' '}
        {elementDescriptions[chart.element].label}에 놓고 읽어요. {stems[stem]}
      </p>
      {season ? (
        <>
          <h3>
            월지 ‘{branch}’에서 읽는 {season.name}
          </h3>
          <p>
            월주의 둘째 글자는 태어난 때의 계절을 담아요. 전통 명리가 그리는 {season.name}은 {season.text}
          </p>
        </>
      ) : (
        <p>절기가 바뀌는 날이라 태어난 시각에 따라 월주가 달라져요. 계절 풀이는 비워두었어요.</p>
      )}
      {!chart.time && (
        <p className="chart-note">
          태어난 시각을 모르더라도 일주와 일간은 읽을 수 있어요.
          {!chart.year && ' 입춘 경계에 걸쳐 년주도 미상으로 표시했어요.'}
        </p>
      )}
    </section>
  );
}
