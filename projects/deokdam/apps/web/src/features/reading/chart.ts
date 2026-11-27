import dayjs from 'dayjs';
import KoreanLunarCalendar from 'korean-lunar-calendar';
import { Solar } from 'lunar-typescript';
import { z } from 'zod';

import { seoulToday } from '@/shared/seoul-time';

import { BirthDateError, type TBirthInput, type TElement } from './contracts';

const hangul = {
  甲: '갑',
  乙: '을',
  丙: '병',
  丁: '정',
  戊: '무',
  己: '기',
  庚: '경',
  辛: '신',
  壬: '임',
  癸: '계',
  子: '자',
  丑: '축',
  寅: '인',
  卯: '묘',
  辰: '진',
  巳: '사',
  午: '오',
  未: '미',
  申: '신',
  酉: '유',
  戌: '술',
  亥: '해',
} satisfies Record<string, string>;

const elements = {
  甲: 'wood',
  乙: 'wood',
  丙: 'fire',
  丁: 'fire',
  戊: 'earth',
  己: 'earth',
  庚: 'metal',
  辛: 'metal',
  壬: 'water',
  癸: 'water',
} as const satisfies Record<string, TElement>;

export interface IChart {
  year: string | null;
  month: string | null;
  day: string;
  time: string | null;
  element: TElement;
  adult: boolean;
}

function solarDate(birth: TBirthInput, today: string) {
  const digits = birth.date.replaceAll('-', '');
  const year = Number(digits.slice(0, 4));
  const month = Number(digits.slice(4, 6));
  const day = Number(digits.slice(6));
  if (year < 1900 || year > Number(today.slice(0, 4))) {
    throw new BirthDateError('1900년부터 오늘까지의 생년월일을 입력해 주세요.');
  }
  if (birth.calendar === 'solar') {
    const date = digits.slice(0, 4) + '-' + digits.slice(4, 6) + '-' + digits.slice(6);
    if (!z.iso.date().safeParse(date).success || date > today) {
      throw new BirthDateError('양력 생년월일을 확인해 주세요.');
    }
    return { year, month, day, iso: date };
  }

  const lunar = new KoreanLunarCalendar();
  if (!lunar.setLunarDate(year, month, day, birth.leapMonth)) {
    throw new BirthDateError('음력 생년월일과 윤달 여부를 확인해 주세요.');
  }
  const solar = lunar.getSolarCalendar();
  const iso = [solar.year, solar.month, solar.day].map((part) => String(part).padStart(2, '0')).join('-');
  if (iso > today) throw new BirthDateError('오늘까지의 생년월일을 입력해 주세요.');
  return { ...solar, iso };
}

function cycleLabel(cycle: string) {
  return [...cycle].map((character) => hangul[character as keyof typeof hangul] ?? character).join('');
}

export function calculateChart(birth: TBirthInput, today = seoulToday()): IChart {
  const date = solarDate(birth, today);
  const hour = birth.time ? Number(birth.time.slice(0, 2)) : 0;
  const minute = birth.time ? Number(birth.time.slice(3)) : 0;
  const wallClock = Solar.fromYmdHms(date.year, date.month, date.day, hour, minute, 0);
  // The solar-term table in lunar-typescript uses UTC+8. Day and hour pillars use Korean wall time.
  const terms = wallClock.nextHour(-1).getLunar().getEightChar();
  const endTerms = birth.time
    ? terms
    : Solar.fromYmdHms(date.year, date.month, date.day, 22, 59, 59).getLunar().getEightChar();
  const wallChart = wallClock.getLunar().getEightChar();
  const dayCycle = wallChart.getDay();
  const element = elements[dayCycle[0] as keyof typeof elements];

  return {
    year: terms.getYear() === endTerms.getYear() ? cycleLabel(terms.getYear()) : null,
    month: terms.getMonth() === endTerms.getMonth() ? cycleLabel(terms.getMonth()) : null,
    day: cycleLabel(dayCycle),
    time: birth.time ? cycleLabel(wallChart.getTime()) : null,
    element,
    adult: dayjs(today).diff(dayjs(date.iso), 'year') >= 19,
  };
}
