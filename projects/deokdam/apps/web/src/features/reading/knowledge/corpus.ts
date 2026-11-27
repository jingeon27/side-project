import type { topics, TTopic } from '@/shared/topics';

import type { TElement } from '../contracts';

type TConcern = (typeof topics)[TTopic]['concerns'][number]['id'];

interface IReference {
  id: string;
  scope: TElement | TConcern;
  title: string;
  text: string;
  source: 'classical' | 'editorial';
}

export const readingReferences = [
  {
    id: 'wood',
    scope: 'wood',
    title: '목(木)이 자라는 이미지',
    text: '『서경』 「홍범」은 목을 굽거나 곧게 자라는 나무의 모습으로 설명한다. 풀이에서는 시간이 들면서 가지를 뻗는 비유로 활용한다. 지금 이미 해온 일에서 한 가지를 이어가는 데 초점을 둔다.',
    source: 'classical',
  },
  {
    id: 'fire',
    scope: 'fire',
    title: '화(火)가 위로 오르는 이미지',
    text: '『서경』 「홍범」은 화를 타오르며 위로 향하는 모습으로 설명한다. 풀이에서는 조용히 품었던 말이나 마음이 밖으로 드러나는 비유로 활용한다. 말 한마디나 짧은 표시처럼 표현의 크기를 스스로 정할 수 있다.',
    source: 'classical',
  },
  {
    id: 'earth',
    scope: 'earth',
    title: '토(土)가 작물을 기르는 이미지',
    text: '『서경』 「홍범」은 토를 씨를 뿌려 가꾸고 거두는 일에 빗댄다. 풀이에서는 하루를 버텨 내는 바탕과 가꾸는 과정의 비유로 활용한다. 익숙하게 해온 습관이나 일상의 작은 순서를 떠올릴 수 있다.',
    source: 'classical',
  },
  {
    id: 'metal',
    scope: 'metal',
    title: '금(金)이 모양을 바꾸는 이미지',
    text: '『서경』 「홍범」은 금을 손질해 모양을 바꿀 수 있는 것으로 설명한다. 풀이에서는 이미 가진 것을 목적에 맞게 다듬는 비유로 활용한다. 자료나 문장이 여러 개라면 필요한 부분 한 가지를 고르는 데 초점을 둔다.',
    source: 'classical',
  },
  {
    id: 'water',
    scope: 'water',
    title: '수(水)가 아래로 흐르는 이미지',
    text: '『서경』 「홍범」은 수를 적시면서 아래로 흐르는 모습으로 설명한다. 풀이에서는 상황을 살피고 갈 길을 고르는 비유로 활용한다. 당장 큰 결론을 내기 어려울 때 확인할 수 있는 것부터 살핀다.',
    source: 'classical',
  },
  {
    id: 'silence-trim',
    scope: 'silence',
    title: '지원서 첫 줄과 공고 맞춰보기',
    text: '지원 여러 건에 답장이 없고 무엇을 바꿀지 고민이라면 최근 공고 하나를 고른다. 첫 번째 업무를 읽고, 내가 그와 비슷한 일을 했던 경험이 지원서 첫 줄에 들어 있는지 확인한다. 지금 있는 문장에서 역할이나 숫자 하나를 더 선명하게 쓴다. 다듬기, 선별, 금.',
    source: 'editorial',
  },
  {
    id: 'silence-rhythm',
    scope: 'silence',
    title: '메일함을 확인할 시간 정하기',
    text: '지원 결과가 오지 않아 자꾸 받은편지함을 열었다면, 오늘 메일을 확인할 시간을 한 번 정해도 좋다. 연락 여부와 별도로 오늘 마친 일을 한 줄 남긴다. 하루의 리듬, 씨를 뿌리고 가꾸는 일, 토.',
    source: 'editorial',
  },
  {
    id: 'silence-next',
    scope: 'silence',
    title: '다음 지원에 이어 쓸 경험 찾기',
    text: '연락이 없는 지원서를 처음부터 다 고치려 들면 막막할 수 있다. 전에 해본 일 중 다음 지원에도 쓸 수 있는 경험 하나를 골라 무엇을 하고 누구를 도왔는지 한 줄 적는다. 성장, 시도를 이어가기, 목.',
    source: 'editorial',
  },
  {
    id: 'comparison-note',
    scope: 'comparison',
    title: '축하와 내 마음을 한 줄씩 쓰기',
    text: '친구가 합격했다는 말을 듣고 복잡한 감정이 올라올 수 있다. 친구에게는 실제로 기억하는 노력 한 가지를 짚어 축하하고, 내 메모에는 이번 주에 내가 해낸 일을 구체적으로 한 줄 적는다. 표현, 선명한 말, 화.',
    source: 'editorial',
  },
  {
    id: 'comparison-progress',
    scope: 'comparison',
    title: '지난달의 나와 비교할 기록 찾기',
    text: '다른 사람의 발표와 비교하고 있다면 지난달의 지원 문장과 지금의 문장 하나를 펼친다. 이번에 더 분명해진 부분 한 가지를 골라 적는다. 이전 시도에서 다음으로 이어지는 변화, 성장, 목.',
    source: 'editorial',
  },
  {
    id: 'comparison-rest',
    scope: 'comparison',
    title: '답장하기 전 마음에 여유 두기',
    text: '친구의 결과를 듣고 마음이 무거운 날에는 답장을 잠시 미뤄도 된다. 휴대폰을 내려놓고 지금 속상한 이유를 짧게 적은 뒤 하고 싶은 말을 고른다. 감정을 가라앉히고 바라보기, 흐름, 수.',
    source: 'editorial',
  },
  {
    id: 'interview-voice',
    scope: 'interview',
    title: '면접에서 할 말 한 번 녹음하기',
    text: '다음 면접을 앞두고 머릿속으로 답만 고치고 있다면, 해본 일 하나를 30초 동안 평소 말투로 설명해 본다. 녹음을 들으며 첫 문장을 더 짧게 만들 수 있는 곳을 고른다. 말로 드러내기, 표현, 화.',
    source: 'editorial',
  },
  {
    id: 'interview-example',
    scope: 'interview',
    title: '면접 답변을 한 가지 경험으로 좁히기',
    text: '면접 질문에 어떤 일을 말할지 고민된다면 답변 하나를 고른다. 배경과 내가 직접 한 행동을 구분해 써 본다. 직접 한 행동을 첫 문장에 남기고 겹치는 형용사 하나를 지운다. 다듬기, 선별, 금.',
    source: 'editorial',
  },
  {
    id: 'interview-routine',
    scope: 'interview',
    title: '면접 당일에 할 첫 행동 정하기',
    text: '면접을 떠올릴수록 긴장된다면 시작 전에 내가 할 행동 하나를 정한다. 메모를 책상에 놓거나 가는 길에 예상 질문 하나를 읽는 등 차분히 반복할 수 있는 순서가 좋다. 바탕을 만드는 준비, 하루의 리듬, 토.',
    source: 'editorial',
  },
  {
    id: 'first-words-meal',
    scope: 'first-words',
    title: '결과 얘기 전에 저녁 메뉴 묻기',
    text: '아이에게 무슨 말을 건넬지 고민이라면 평소 좋아하는 음식 하나를 떠올린다. 오늘 먹고 싶은지 가볍게 물어본다. 함께 식사하는 익숙한 감각에서 이야기를 시작하는 방법이다. 일상, 가꾸는 관계, 토.',
    source: 'editorial',
  },
  {
    id: 'first-words-recognize',
    scope: 'first-words',
    title: '아이의 이름을 불러 노력 한 가지 짚기',
    text: '아이를 응원할 말을 고를 때 실제로 본 행동을 떠올린다. 늦게 돌아와 내일 준비를 한 일처럼 작은 일을 짚어 “그거 봤어, 애썼어”라고 짧게 말해 본다. 따뜻한 표현, 관계 바깥으로 전하기, 화.',
    source: 'editorial',
  },
  {
    id: 'first-words-listen',
    scope: 'first-words',
    title: '아이 스스로 말할 자리를 남기기',
    text: '아이와 이야기를 시작하려다가 결과부터 물을 것 같다면, 지금 듣고 싶은지 “얘기하고 싶을 때 들어줄게”라고 먼저 건넨다. 답이 짧으면 잠깐 기다렸다가 다른 이야기를 해도 된다. 상대의 때를 살피기, 물이 흐르는 이미지, 수.',
    source: 'editorial',
  },
  {
    id: 'waiting-switch',
    scope: 'waiting',
    title: '부모가 오늘 할 수 있는 일 하나 고르기',
    text: '내가 아이보다 더 떨린다면, 지금 바꿀 수 있는 것과 기다려야 하는 것을 종이에 한 줄씩 나눈다. 오늘 필요한 연락이나 저녁 약속처럼 내가 할 수 있는 행동 하나에만 손을 댄다. 분류하고 선별하기, 금.',
    source: 'editorial',
  },
  {
    id: 'waiting-rhythm',
    scope: 'waiting',
    title: '발표를 기다리는 날의 식사 시간 잡기',
    text: '아이의 발표 전후로 집안 전체의 하루가 멈춘 것 같다면 함께 밥 먹는 시간만 정해도 된다. 아이가 원할 때 곁을 내어 주기 위해 부모 자신의 식사와 휴식 시간을 먼저 챙긴다. 하루의 바탕, 토.',
    source: 'editorial',
  },
  {
    id: 'waiting-message',
    scope: 'waiting',
    title: '부모의 떨림을 부담 없이 표현하기',
    text: '부모도 결과를 기다리며 떨릴 때는 아이에게 답을 요구하는 질문보다 자신의 말 한 줄을 고른다. “오늘 뭐가 나오든 나는 네 편이야”처럼 함께 있다는 뜻을 담아 전한다. 말로 꺼내기, 표현, 화.',
    source: 'editorial',
  },
  {
    id: 'scores-plan',
    scope: 'scores',
    title: '성적을 확인한 뒤 할 일 적어두기',
    text: '성적 확인 전에 자꾸 여러 결과를 상상하게 된다면, 화면을 열고 바로 할 일 하나를 정한다. 성적표를 저장하거나 궁금한 항목에 표시하고 잠깐 화면에서 나오는 순서를 고를 수 있다. 선별, 구체적인 정리, 금.',
    source: 'editorial',
  },
  {
    id: 'scores-request',
    scope: 'scores',
    title: '먼저 듣고 싶은 말 한 줄 정하기',
    text: '성적을 봤을 때 곁에서 어떤 반응을 원할지 미리 생각해 본다. “숫자 얘기 전에 고생했다는 말부터 듣고 싶어”처럼 가족이나 친구에게 내 말로 짧게 전한다. 원하는 도움을 표현하기, 화.',
    source: 'editorial',
  },
  {
    id: 'scores-break',
    scope: 'scores',
    title: '발표 뒤에 판단을 잠시 미루는 법',
    text: '성적표를 열자마자 다음 선택을 결정할 필요는 없다. 예상과 다른 수치에 표시를 한 뒤, 물을 한 잔 마시고 나서 필요한 내용을 다시 확인한다. 흐름을 살피고 다음 길을 고르기, 수.',
    source: 'editorial',
  },
  {
    id: 'family-talk-opening',
    scope: 'family-talk',
    title: '식탁에서 듣고 싶은 말부터 건네기',
    text: '가족에게 성적 얘기를 꺼내기 어렵다면 첫 문장만 준비한다. “나 오늘 고생했다고 한 번만 말해줘”처럼 점수 공유에 앞서 지금 필요한 반응을 말한다. 말로 드러내기, 화.',
    source: 'editorial',
  },
  {
    id: 'family-talk-time',
    scope: 'family-talk',
    title: '성적 얘기를 나눌 시간부터 잡기',
    text: '밥 먹는 자리에서 갑자기 결과를 설명하기 어렵다면 대화할 시간을 먼저 물어본다. “저녁 먹고 잠깐 얘기해도 돼?”라는 말로 시작하고 다른 얘기는 편한 때에 이어간다. 함께하는 일상과 순서, 토.',
    source: 'editorial',
  },
  {
    id: 'family-talk-note',
    scope: 'family-talk',
    title: '말로 꺼내기 어려운 부분을 메모하기',
    text: '집에서 말이 막힐 때는 사실과 바라는 반응을 짧은 메모에 나눠 적어 본다. 가족에게는 가장 전달하고 싶은 한 줄만 보여줘도 된다. 불필요한 말 정리, 한 줄을 고르기, 금.',
    source: 'editorial',
  },
] as const satisfies readonly IReference[];
