import { describe, expect, it } from 'vitest';

import {
  batchMaterials,
  collectionNameSchema,
  materialKey,
  materialLimits,
  materialUploadSchema,
  splitMaterial,
} from './materials';

describe('참고 자료 업로드 계약', () => {
  it('묶음 이름은 한글, 영문, 숫자, 공백, 밑줄과 붙임표만 받는다', () => {
    for (const name of ['무협 설정', 'venezuela-notes_2', ' 앞뒤 공백 '])
      expect(collectionNameSchema.safeParse(name).success).toBe(true);
    expect(collectionNameSchema.parse(' 앞뒤 공백 ')).toBe('앞뒤 공백');
    for (const name of ['', "a' OR 1=1 --", '../files', '가'.repeat(41)])
      expect(collectionNameSchema.safeParse(name).success).toBe(false);
  });
  it('긴 파일은 문단 경계에서 번호가 붙은 자료 여러 개로 나누고 내용을 잃지 않는다', () => {
    const text = Array.from({ length: 40 }, (_, index) => `${index}번째 문단 ${'가'.repeat(20)}`).join('\n');
    const parts = splitMaterial('강호 용어집', text, 300);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((part) => part.text.length <= 300)).toBe(true);
    expect(parts[0]?.title).toBe(`강호 용어집 (1/${parts.length})`);
    expect(parts.map((part) => part.text).join('')).toBe(text);
    expect(parts.every((part, index) => index === 0 || part.text.startsWith('\n'))).toBe(true);
    expect(splitMaterial('짧은 메모', '객잔의 저녁')).toEqual([{ title: '짧은 메모', text: '객잔의 저녁' }]);
    expect(splitMaterial('  ', '내용')[0]?.title).toBe('제목 없는 자료');
    expect(splitMaterial('빈 파일', ' \n ')).toEqual([]);
  });
  it('한 요청의 자료 수와 글자 수 한도에 맞춰 묶고 순서를 유지한다', () => {
    const small = Array.from({ length: materialLimits.documents + 3 }, (_, index) => ({
      title: `자료 ${index}`,
      text: '내용',
    }));
    const batches = batchMaterials(small);
    expect(batches.map((batch) => batch.length)).toEqual([materialLimits.documents, 3]);
    expect(batches.flat()).toEqual(small);
    const large = Array.from({ length: 6 }, (_, index) => ({
      title: `큰 자료 ${index}`,
      text: '나'.repeat(materialLimits.characters),
    }));
    for (const batch of batchMaterials(large))
      expect(materialUploadSchema.safeParse({ collection: '무협 설정', documents: batch }).success).toBe(
        true,
      );
    expect(batchMaterials([])).toEqual([]);
  });
  it('항상 포함할 자료는 6천 자까지만 받고, 방식을 정하지 않으면 관련 부분 검색으로 올린다', () => {
    const short = { title: '인물 설정', text: '가'.repeat(materialLimits.alwaysCharacters) };
    const long = { title: '긴 설정', text: '가'.repeat(materialLimits.alwaysCharacters + 1) };
    expect(
      materialUploadSchema.safeParse({ collection: '묶음', role: 'always', documents: [short] }).success,
    ).toBe(true);
    expect(
      materialUploadSchema.safeParse({ collection: '묶음', role: 'always', documents: [long] }).success,
    ).toBe(false);
    expect(materialUploadSchema.parse({ collection: '묶음', documents: [long] }).role).toBe('search');
    expect(
      materialUploadSchema.safeParse({ collection: '묶음', role: 'pinned', documents: [short] }).success,
    ).toBe(false);
  });
  it('요청 전체 글자 수를 넘거나 자료가 없는 업로드를 거부한다', () => {
    const document = { title: '자료', text: '다'.repeat(materialLimits.characters) };
    expect(
      materialUploadSchema.safeParse({
        collection: '묶음',
        documents: Array.from({ length: 6 }, () => document),
      }).success,
    ).toBe(false);
    expect(materialUploadSchema.safeParse({ collection: '묶음', documents: [] }).success).toBe(false);
    expect(
      materialUploadSchema.safeParse({ collection: '묶음', documents: [{ title: '자료', text: '' }] })
        .success,
    ).toBe(false);
  });
  it('같은 묶음의 같은 제목과 분량은 이미 올린 자료로 본다', () => {
    const material = { collection: '무협 설정', title: '강호 용어집', characters: 1200 };
    expect(materialKey(material)).toBe(materialKey({ ...material }));
    expect(materialKey(material)).not.toBe(materialKey({ ...material, collection: '다른 묶음' }));
    expect(materialKey(material)).not.toBe(materialKey({ ...material, characters: 1201 }));
  });
});
