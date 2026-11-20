// Loaded as a native browser module by the loopback label server.
type Frame = { sha: string; match: string; name: string; revision: number };
type Mark = { kind: string; side: string; x: number; y: number; form?: string; health?: string };
type Group = 'objects' | 'effects' | 'opponentPlays';
const el = <T extends HTMLElement>(id: string) => {
  const element = document.getElementById(id);
  if (!element) throw new Error(id);
  return element as T;
};
const input = (id: string) => el<HTMLInputElement>(id);
const select = (id: string) => el<HTMLSelectElement>(id);
const value = (id: string) => el<HTMLInputElement | HTMLSelectElement>(id).value;
const words: Record<string, string> = {
  unsure: '불확실',
  base: '일반',
  hero: '히어로',
  champion: '챔피언',
  evolution: '진화',
  disabled: '비활성',
  full: '가득',
  above_half: '절반 이상',
  below_half: '절반 미만',
};
const options = (node: HTMLSelectElement | HTMLDataListElement, ids: string[]) =>
  node.replaceChildren(...ids.map((id) => new Option(words[id] ?? id.replaceAll('_', ' '), id)));
async function api<T>(path: string, data?: unknown): Promise<T> {
  const response = await fetch(
    path,
    data === undefined
      ? {}
      : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) },
  );
  const result = await response.json();
  if (!response.ok) throw new Error(String(result.error));
  return result as T;
}
const announce = (s: string) => {
  el('status').textContent = s;
};
const split = () => value('split');
const track = (event: string) => void api('/event', { event, split: split() }).catch(() => {});
const state: {
  frame?: Frame;
  opened: number;
  active: boolean;
  generation: number;
  marks: { group: Group; point: Mark }[];
} = { opened: 0, active: false, generation: 0, marks: [] };
const dimensions = { x: 368, y: 652 };
const unknown = 'unsure';
const list = ['blueLeft', 'redLeft', 'blueRight', 'redRight', 'blueKing', 'redKing'];
const captions = ['아군 왼쪽', '상대 왼쪽', '아군 오른쪽', '상대 오른쪽', '아군 킹', '상대 킹'];
const cards = await api<{ cards: string[]; bodies: string[] }>('/catalogue');
const fieldKind = () => {
  const group = value('type');
  options(el<HTMLDataListElement>('ids'), [
    unknown,
    ...(group === 'objects'
      ? cards.bodies
      : group === 'opponentPlays'
        ? cards.cards
        : [...new Set([...cards.cards, ...cards.bodies])]),
  ]);
};
function selector(parent: HTMLElement, id: string, title: string, values: string[]) {
  const label = document.createElement('label');
  label.append(title);
  const node = document.createElement('select');
  node.id = id;
  options(node, values);
  label.append(node);
  parent.append(label);
}
for (const i of [0, 1, 2, 3]) {
  const row = document.createElement('div');
  row.className = 'row';
  selector(row, 'slot' + i, String(i + 1) + '번 카드', [unknown, ...cards.cards]);
  selector(row, 'state' + i, '상태', [unknown, 'base', 'evolution', 'hero', 'disabled']);
  el('slots').append(row);
}
for (const [i, key] of list.entries()) {
  const label = document.createElement('label');
  label.append(captions[i] ?? '');
  const node = document.createElement('input');
  node.type = 'number';
  node.min = '0';
  node.max = '99999';
  node.id = key;
  node.placeholder = '불확실';
  label.append(node);
  el('towers').append(label);
}
options(select('next'), [unknown, ...cards.cards]);
options(select('mana'), [unknown, ...Array.from({ length: 11 }, (_, i) => String(i))]);
options(select('form'), [unknown, 'base', 'evolution', 'hero', 'champion']);
options(select('health'), [unknown, 'full', 'above_half', 'below_half']);
function renderMarks() {
  const ctx = el<HTMLCanvasElement>('marks').getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, 368, 652);
    for (const [index, { point }] of state.marks.entries()) {
      ctx.fillStyle = point.side === 'red' ? '#b52b3e' : point.side === 'blue' ? '#1356ad' : '#33463c';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(point.x, point.y, 8, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(index + 1), point.x, point.y);
    }
  }
  el('points').replaceChildren(
    ...state.marks.map(({ point }, index) => {
      const li = document.createElement('li');
      li.append(point.kind + ' · ' + point.side + ' (' + point.x + ', ' + point.y + ')');
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '삭제';
      remove.onclick = () => {
        state.marks.splice(index, 1);
        renderMarks();
      };
      li.append(remove);
      return li;
    }),
  );
}
function mark(x: number, y: number) {
  if (!state.frame || state.active) return;
  const group = value('type') as Group;
  const kind = value('kind').trim() || unknown;
  const allowed = Array.from(el<HTMLDataListElement>('ids').options).some((o) => o.value === kind);
  if (
    !allowed ||
    !Number.isInteger(x) ||
    !Number.isInteger(y) ||
    x < 0 ||
    y < 0 ||
    x >= dimensions.x ||
    y >= dimensions.y
  ) {
    announce('목록의 이름과 화면 안 좌표를 선택해 주세요.');
    return;
  }
  const point = {
    kind,
    side: group === 'opponentPlays' ? 'red' : value('side'),
    x,
    y,
    ...(group === 'objects' ? { form: value('form'), health: value('health') } : {}),
  };
  state.marks.push({ group, point });
  renderMarks();
}
const frameImage = el<HTMLImageElement>('frame');
frameImage.onclick = (event) => {
  const r = frameImage.getBoundingClientRect();
  mark(
    Math.floor(((event.clientX - r.left) * dimensions.x) / r.width),
    Math.floor(((event.clientY - r.top) * dimensions.y) / r.height),
  );
};
el('place').onclick = () => mark(input('x').valueAsNumber, input('y').valueAsNumber);
select('type').onchange = fieldKind;
async function load() {
  const generation = ++state.generation;
  const save = el<HTMLButtonElement>('save');
  save.disabled = true;
  state.frame = undefined;
  const rows = await api<Frame[]>('/' + value('mode') + '/' + split());
  if (generation !== state.generation) return;
  const frame = rows[0];
  el<HTMLFormElement>('review').reset();
  state.marks.splice(0);
  renderMarks();
  fieldKind();
  if (!frame) {
    frameImage.removeAttribute('src');
    el('which').textContent = '현재 검토할 화면이 없습니다.';
    return;
  }
  state.frame = frame;
  frameImage.src = '/frame/' + frame.sha;
  el('which').textContent = frame.match.slice(0, 8) + ' / ' + frame.name + ' · 대기 ' + rows.length + '장';
  state.opened = performance.now();
  save.disabled = false;
}
function failure(error: unknown) {
  announce(String(error));
}
const reload = () => {
  announce('');
  void load().catch(failure);
};
select('split').onchange = reload;
select('mode').onchange = reload;
el<HTMLFormElement>('review').onsubmit = async (event) => {
  event.preventDefault();
  const frame = state.frame;
  if (!frame || state.active) return;
  state.active = true;
  el<HTMLButtonElement>('save').disabled = true;
  select('split').disabled = true;
  select('mode').disabled = true;
  track('trophy_label_save_clicked');
  const knownTowers = Object.fromEntries(
    list.filter((key) => value(key) !== '').map((key) => [key, input(key).valueAsNumber]),
  );
  const byGroup = (group: Group) => state.marks.filter((m) => m.group === group).map((m) => m.point);
  try {
    await api('/label', {
      revision: frame.revision,
      seconds: (performance.now() - state.opened) / 1000,
      label: {
        frameSHA256: frame.sha,
        objects: byGroup('objects'),
        effects: byGroup('effects'),
        objectsComplete: input('objectsComplete').checked,
        effectsComplete: input('effectsComplete').checked,
        opponentPlays: byGroup('opponentPlays').map(({ kind, ...p }) => ({ ...p, card: kind })),
        hand: [0, 1, 2, 3].map((i) => ({ card: value('slot' + i), state: value('state' + i) })),
        nextCard: value('next'),
        elixir: value('mana') === unknown ? unknown : Number(value('mana')),
        towers: knownTowers,
      },
    });
    announce('저장했습니다.');
    await load();
  } catch (error) {
    failure(error);
    el<HTMLButtonElement>('save').disabled = false;
  } finally {
    state.active = false;
    select('split').disabled = false;
    select('mode').disabled = false;
  }
};
fieldKind();
track('trophy_label_opened');
reload();
export {};
