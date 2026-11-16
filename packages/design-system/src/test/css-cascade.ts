import { loadTheme } from './tailwind-theme';

/**
 * Button 계열(Button·IconButton·FloatingActionButton) 테스트가 함께 쓰는 생성 CSS 도우미.
 * 요소의 클래스로 패키지 테마의 CSS를 만들어 지금 걸리는 규칙과 이기는 값을 계산한다.
 */

type TSpecificity = [id: number, classLike: number, type: number];
type TPseudoState = 'hover' | 'active';

/** 생성 CSS의 규칙 하나. `media`는 감싼 @media 조건이고 `order`는 소비 앱 빌드에서 나오는 순서다. */
interface IGeneratedRule {
  selector: string;
  declarations: Map<string, string>;
  media: string[];
  order: number;
}

interface IRuleState {
  /** 걸려 있다고 볼 가상 클래스. 이 밖의 :hover·:active가 붙은 규칙은 뺀다. */
  pseudo?: TPseudoState[];
  /** 맞는다고 볼 @media 조건. 기본은 마우스가 있는 기기다. */
  media?: string[];
}

const theme = loadTheme();
// 앞에 역슬래시가 없을 때만 가상 클래스다. `hover\:bg-sunken`처럼 클래스 이름 안의 글자는 뺀다.
const statePseudo = /(?<!\\):(hover|active)(?![\w-])/g;
const leadingClass = /^\.(?:\\.|[\w-])+/;
// 세 겹까지 중첩된 괄호 묶음. 이스케이프한 괄호(`\(`)는 클래스 이름의 글자라 세지 않는다.
const parens = String.raw`\((?:\\.|[^()\\]|\((?:\\.|[^()\\]|\((?:\\.|[^()\\])*\))*\))*\)`;
const attribute = String.raw`\[(?:\\.|[^\]\\])*\]`;
const simpleSelectors = new RegExp(String.raw`${attribute}|(#|\.|::|:)?((?:\\.|[\w-])+)(${parens})?`, 'g');
const listItems = new RegExp(String.raw`(?:\\.|${parens}|${attribute}|[^,\\()[\]])+`, 'g');
// `hover:`의 `(hover: hover)`와 임의 변형 `[@media(hover:hover)]:`의 `(hover:hover)`는 같은 조건이다.
const mediaKey = (condition: string) => condition.replace(/\s+/g, '');

function compareSpecificity(left: TSpecificity, right: TSpecificity) {
  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
}

/** 쉼표로 나뉜 선택자 목록 가운데 가장 큰 명시도. */
function strongest(list: string) {
  return [...list.matchAll(listItems)]
    .map(([item]) => specificity(item))
    .reduce<TSpecificity>(
      (best, current) => (compareSpecificity(current, best) > 0 ? current : best),
      [0, 0, 0],
    );
}

function simpleSpecificity([token, prefix, name = '', args]: RegExpMatchArray): TSpecificity {
  if (prefix === '#') return [1, 0, 0];
  // 가상 요소와 타입 선택자
  if (prefix === '::' || /^[a-z]/i.test(token)) return [0, 0, 1];
  // 클래스와 속성
  if (prefix !== ':') return [0, 1, 0];
  if (name === 'where') return [0, 0, 0];
  if (!args || !['not', 'is', 'has'].includes(name)) return [0, 1, 0];
  return strongest(args.slice(1, -1));
}

/** 선택자 하나의 명시도. `:where()`는 0이고 `:not()`·`:is()`·`:has()`는 인자 중 가장 큰 값만 더한다. */
export function specificity(selector: string): TSpecificity {
  return [...selector.matchAll(simpleSelectors)]
    .map(simpleSpecificity)
    .reduce<TSpecificity>(
      (total, part) => [total[0] + part[0], total[1] + part[1], total[2] + part[2]],
      [0, 0, 0],
    );
}

/** 클래스 하나가 만드는 CSS에서 규칙을 꺼낸다. @property처럼 선택자가 아닌 블록은 건너뛴다. */
function parseRules(css: string) {
  const preludes: string[] = [];
  return [...css.matchAll(/([^{}]*)([{}])/g)].flatMap(([, text = '', brace]) => {
    if (brace === '{') {
      preludes.push(text.trim());
      return [];
    }
    const selector = preludes.pop() ?? '';
    if (!selector || selector.startsWith('@')) return [];
    const declarations = [...text.matchAll(/([\w-]+)\s*:\s*([^;]+);/g)].map(
      ([, property = '', value = '']) => [property, value.trim()] as const,
    );
    const media = preludes
      .filter((prelude) => prelude.startsWith('@media'))
      .map((prelude) => prelude.slice(6).trim());
    return [{ selector, declarations: new Map(declarations), media }];
  });
}

/** 요소의 클래스가 만드는 규칙을 소비 앱 빌드와 같은 순서로 돌려준다. */
async function generatedRules(element: Element): Promise<IGeneratedRule[]> {
  const designSystem = await theme;
  const classes = element.className.split(/\s+/).filter(Boolean);
  const css = designSystem.candidatesToCss(classes);
  return designSystem
    .getClassOrder(classes)
    .flatMap(([, order], index) => (order === null ? [] : [{ order, css: css[index] ?? '' }]))
    .sort((left, right) => Number(left.order - right.order))
    .flatMap((candidate) => parseRules(candidate.css))
    .map((rule, order) => ({ ...rule, order }));
}

/**
 * 요소의 클래스가 만드는 규칙 중 `pseudo` 상태에서 지금 요소에 걸리는 규칙. jsdom은 마우스 올림·누름 상태를 만들지
 * 않으므로 그 가상 클래스를 요소에 잠시 붙인 속성으로 바꿔 확인한다(명시도는 같다). jsdom 29는 `\&`처럼 이스케이프한
 * &가 든 클래스 이름을 맞추지 못한다. 규칙은 요소 자신의 클래스에서 나오므로 맨 앞 클래스는 `*`로 바꾸고 조건만 본다.
 */
export async function matchingRules(
  element: Element,
  { pseudo = [], media = ['(hover: hover)'] }: IRuleState = {},
) {
  const rules = await generatedRules(element);
  for (const name of pseudo) element.setAttribute(`data-css-state-${name}`, '');
  try {
    return rules.filter(
      (rule) =>
        !rule.selector.includes('::') &&
        rule.media.every((condition) => media.map(mediaKey).includes(mediaKey(condition))) &&
        element.matches(rule.selector.replace(leadingClass, '*').replace(statePseudo, '[data-css-state-$1]')),
    );
  } finally {
    for (const name of pseudo) element.removeAttribute(`data-css-state-${name}`);
  }
}

/**
 * 마우스를 올렸을 때만 걸리는(`:hover`가 붙은) 규칙 가운데 바탕(background-color·밝기)을 바꾸는 규칙의 선택자.
 * `media`를 주지 않으면 마우스가 있는 기기로 본다. Storybook의 `.storybook/preview.css`가 `@source '../src/**'`로
 * 이 파일도 읽으므로 유틸리티 이름과 같은 낱말을 문자열로 두지 않는다.
 */
export async function hoverBackgroundSelectors(element: Element, media?: string[]) {
  return (await matchingRules(element, { pseudo: ['hover'], media }))
    .filter((rule) => rule.selector.match(statePseudo)?.includes(':hover'))
    .filter((rule) => rule.declarations.has('background-color') || rule.declarations.has('--tw-brightness'))
    .map((rule) => rule.selector);
}

/** `property`를 정하는 규칙 가운데 이기는 값. 명시도가 높은 규칙, 같으면 생성 CSS에서 뒤에 나온 규칙이 이긴다. */
export function winningValue(rules: IGeneratedRule[], property: string) {
  const [winner] = rules
    .filter((rule) => rule.declarations.has(property))
    .sort(
      (left, right) =>
        compareSpecificity(specificity(right.selector), specificity(left.selector)) ||
        right.order - left.order,
    );
  return winner?.declarations.get(property);
}
