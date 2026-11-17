import { describe, expect, it } from 'vitest';

import { libraryKey, readBackup, readLibrary, writeLibrary } from './library';
import { sampleProject } from './sample';
import {
  briefSchema,
  manuscript,
  mediaRequestSchema,
  projectSchema,
  referenceImage,
  safeFilename,
  subtitles,
  type TScene,
} from './story';
import { wrapCaption } from './video-export';

describe('한국어 작품과 백업', () => {
  it('한글·따옴표·이모지·줄바꿈을 저장, 복원, 원고 내보내기에서 보존한다', () => {
    const project = { ...sampleProject(), title: '“괜찮아, 서우야” 🐈', characters: '밤이\n서우' };
    const storage = new Map<string, string>();
    writeLibrary(
      {
        setItem: (key, value) => {
          storage.set(key, value);
        },
      },
      [project],
    );
    expect(readLibrary({ getItem: (key) => storage.get(key) ?? null })).toEqual([project]);
    expect(readBackup(JSON.stringify(project))).toEqual(project);
    expect(manuscript(project)).toContain('“괜찮아, 서우야” 🐈');
    expect(manuscript(project)).toContain('밤이\n서우');
  });
  it('손상된 저장본을 읽기 실패 후 덮어쓰거나 지우지 않는다', () => {
    const storage = new Map([[libraryKey, '{broken']]);
    expect(() => readLibrary({ getItem: (key) => storage.get(key) ?? null })).toThrow();
    expect(storage.get(libraryKey)).toBe('{broken');
  });
  it('가져오기에서 외부 실행 URL·잘못된 분량·미지원 버전을 거부한다', () => {
    const project = sampleProject();
    expect(projectSchema.safeParse({ ...project, version: 2 }).success).toBe(false);
    expect(
      projectSchema.safeParse({
        ...project,
        scenes: [{ ...project.scenes[0], image: 'javascript:alert(1)' }],
      }).success,
    ).toBe(false);
    expect(briefSchema.safeParse({ ...project.brief, count: 9 }).success).toBe(false);
    expect(mediaRequestSchema.safeParse({ format: 'novel' }).success).toBe(false);
  });
  it('인물 기준 장면의 현재 이미지를 다른 장면에만 참조로 넘긴다', () => {
    const project = sampleProject();
    const [first, second] = project.scenes as [TScene, TScene];
    const image = '/api/assets/12345678-1234-1234-1234-123456789abc.png';
    const pictured = { ...first, image };
    const scenes = [pictured, second];
    expect(referenceImage({ ...project, scenes }, second)).toBeUndefined();
    const referenced = { ...project, scenes, referenceSceneId: first.id };
    expect(projectSchema.parse(referenced).referenceSceneId).toBe(first.id);
    expect(referenceImage(referenced, second)).toBe(image);
    expect(referenceImage(referenced, pictured)).toBeUndefined();
    expect(referenceImage({ ...referenced, scenes: [first, second] }, second)).toBeUndefined();
  });
  it('생성 요청의 첫 프레임과 인물 기준은 이 앱의 PNG 자산만 받는다', () => {
    const project = sampleProject();
    const input = {
      format: 'drama',
      style: project.brief.style,
      characters: project.characters,
      ratio: '16:9',
      scene: project.scenes[0],
    };
    const image = '/api/assets/12345678-1234-1234-1234-123456789abc.png';
    expect(mediaRequestSchema.safeParse({ ...input, image, reference: image }).success).toBe(true);
    expect(mediaRequestSchema.safeParse({ ...input, reference: 'https://example.com/a.png' }).success).toBe(
      false,
    );
    expect(mediaRequestSchema.safeParse({ ...input, image: image.replace('.png', '.mp4') }).success).toBe(
      false,
    );
    expect(projectSchema.safeParse({ ...project, referenceSceneId: '../scene' }).success).toBe(false);
  });
  it('파일명에서 경로 문자를 제거하고 한국어를 유지한다', () => {
    expect(safeFilename('서우/밤이: 편지?')).toBe('서우_밤이_ 편지_');
  });
});
describe('한국어 자막', () => {
  it('장면 순서대로 정확한 VTT·SRT 시간을 만들고 태그 삽입을 제거한다', () => {
    const scenes = sampleProject().scenes.map((scene, index) => ({
      ...scene,
      duration: 15,
      dialogue: index === 0 ? '<script>안녕</script> --> 밤이\n\n서우' : '한국어 대사',
    }));
    expect(subtitles(scenes)).toContain(
      'WEBVTT\n\n1\n00:00:00.000 --> 00:00:15.000\nscript안녕/script → 밤이\n서우',
    );
    expect(subtitles(scenes, 'srt')).toContain('3\n00:00:30,000 --> 00:00:45,000');
    expect(subtitles(scenes, 'srt')).not.toContain('WEBVTT');
  });
  it('영문 공백이 없는 한국어와 이모지도 글자 단위로 줄바꿈한다', () => {
    const measure = {
      measureText: (text: string) => ({ width: Array.from(text).length * 10 }) as TextMetrics,
    };
    expect(wrapCaption(measure, '고양이🐈서우야', 30)).toEqual(['고양이', '🐈서우', '야']);
  });
});
