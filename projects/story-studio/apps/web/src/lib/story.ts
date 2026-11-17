import dayjs from 'dayjs';
import { z } from 'zod';

import { collectionNameSchema } from './materials';
import { defaultVoiceSettings, voiceSettingsSchema } from './voice-training';

export const formats = [
  { id: 'film', name: '영화', description: '한 장면에서 시작하는 영화', symbol: '01' },
  { id: 'drama', name: '드라마', description: '다음 화가 궁금한 이야기', symbol: '02' },
  { id: 'animation', name: '애니메이션', description: '상상을 움직이는 짧은 이야기', symbol: '03' },
  { id: 'webtoon', name: '웹툰', description: '한 컷씩 펼쳐지는 세계', symbol: '04' },
  { id: 'novel', name: '소설', description: '문장으로 완성하는 나만의 세계', symbol: '05' },
] as const;
export const formatSchema = z.enum(['film', 'drama', 'animation', 'webtoon', 'novel']);
export type TFormat = z.infer<typeof formatSchema>;
export const briefSchema = z.object({
  format: formatSchema,
  premise: z.string().trim().min(10, '이야기를 10자 이상 입력해 주세요.').max(4000),
  genre: z.string().trim().min(1).max(80),
  style: z.string().trim().min(1).max(200),
  count: z.number().int().min(1).max(8),
  ratio: z.enum(['16:9', '9:16', '1:1']),
  quality: z.enum(['draft', 'standard']).default('draft'),
  // Material collections the writer may consult. Only the local engine retrieves from them.
  collections: z.array(collectionNameSchema).max(8).default([]),
});
export type TBrief = z.infer<typeof briefSchema>;
export const sceneContentSchema = z.object({
  title: z.string().min(1).max(150),
  narration: z.string().max(12000),
  dialogue: z.string().max(4000),
  visual: z.string().max(2000),
  duration: z.number().int().min(2).max(15),
});
// One planned scene: what happens in it and where it ends. The writer turns each beat into a scene.
export const beatSchema = z.object({
  title: z.string().min(1).max(150),
  summary: z.string().min(1).max(600),
});
export type TBeat = z.infer<typeof beatSchema>;
export const planSchema = z.object({
  title: z.string().min(1).max(150),
  logline: z.string().max(500),
  synopsis: z.string().max(6000),
  characters: z.string().max(6000),
  outline: z.array(beatSchema).min(1).max(8),
});
type TPlan = z.infer<typeof planSchema>;
type TDraft = Omit<TPlan, 'outline'> & { scenes: z.infer<typeof sceneContentSchema>[] };
// Titles of the materials retrieved while a scene was written.
const sourcesSchema = z.array(z.string().max(120)).max(12);
export const writtenSceneSchema = sceneContentSchema.extend({ sources: sourcesSchema.optional() });
export const voiceSchema = z.object({
  asset: z.string().regex(/^\/api\/assets\/[a-f0-9-]{36}\.wav$/),
  duration: z.number().positive().max(1800),
  settings: voiceSettingsSchema.optional(),
});
export const voiceRequestSchema = z.object({
  text: z.string().trim().min(1).max(4000),
  settings: voiceSettingsSchema.default(defaultVoiceSettings),
});
export const taskSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{8,128}$/),
  status: z.enum(['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED']),
  asset: z
    .string()
    .regex(/^\/api\/assets\/[a-f0-9-]{36}\.mp4$/)
    .optional(),
  error: z.string().max(400).optional(),
  progress: z.string().max(200).optional(),
});
export type TVideoTask = z.infer<typeof taskSchema>;
const imageAssetSchema = z.string().regex(/^\/api\/assets\/[a-f0-9-]{36}\.png$/);
export const sceneSchema = sceneContentSchema.extend({
  id: z.string().uuid(),
  image: imageAssetSchema.optional(),
  video: taskSchema.optional(),
  voice: voiceSchema.optional(),
  voiceSettings: voiceSettingsSchema.optional(),
  sources: sourcesSchema.optional(),
});
export type TScene = z.infer<typeof sceneSchema>;
export const projectSchema = z.object({
  id: z.string().uuid(),
  version: z.literal(1),
  brief: briefSchema,
  title: z.string().min(1).max(150),
  logline: z.string().max(500),
  synopsis: z.string().max(6000),
  characters: z.string().max(6000),
  scenes: z.array(sceneSchema).min(1).max(80),
  // The scene whose current image keeps the same people across newly generated images.
  referenceSceneId: z.string().uuid().optional(),
  // Planned beats that are not written yet; continuing the story writes the first one.
  outline: z.array(beatSchema).max(8).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  sample: z.boolean(),
  renderedVideo: z
    .string()
    .regex(/^\/api\/assets\/[a-f0-9-]{36}\.mp4$/)
    .optional(),
});
export type TProject = z.infer<typeof projectSchema>;
export const librarySchema = z.array(projectSchema).max(50);
export const mediaRequestSchema = z.object({
  format: formatSchema.exclude(['novel']),
  style: briefSchema.shape.style,
  characters: z.string().max(6000),
  ratio: briefSchema.shape.ratio,
  quality: z.enum(['draft', 'standard']).default('draft'),
  scene: sceneContentSchema,
  // A video starts from the scene image; a new image keeps the people of the reference image.
  image: imageAssetSchema.optional(),
  reference: imageAssetSchema.optional(),
});
export type TMediaRequest = z.infer<typeof mediaRequestSchema>;
export const continueSchema = z.object({
  brief: briefSchema,
  title: z.string().min(1).max(150),
  synopsis: z.string().max(6000),
  characters: z.string().max(6000),
  // Scenes written so far; empty while the first scene is being written.
  scenes: z.array(sceneContentSchema).max(80),
  // The planned beat to write now, and the beats after it so this scene does not run ahead of them.
  beat: beatSchema.optional(),
  upcoming: z.array(beatSchema).max(8).optional(),
});
export type TContinueRequest = z.infer<typeof continueSchema>;

export function makeProject(brief: TBrief, draft: TDraft, sample = false): TProject {
  const now = dayjs().toISOString();
  return {
    ...draft,
    id: crypto.randomUUID(),
    version: 1,
    brief,
    scenes: draft.scenes.map((scene) => ({ ...scene, id: crypto.randomUUID() })),
    createdAt: now,
    updatedAt: now,
    sample,
  };
}

export function referenceImage(project: TProject, scene: TScene) {
  // Regenerating the reference scene itself starts fresh instead of copying its own image.
  if (project.referenceSceneId === scene.id) return undefined;
  return project.scenes.find((item) => item.id === project.referenceSceneId)?.image;
}
// A Korean brief to paste into an external image tool; the resulting image is imported into the scene.
export function imagePrompt(
  project: Pick<TProject, 'brief' | 'characters'>,
  scene: Pick<TScene, 'visual' | 'narration'>,
) {
  return [
    `${formats.find((format) => format.id === project.brief.format)?.name ?? '이야기'} 장면 이미지를 한 장 그려 주세요.`,
    `그림체와 연출: ${project.brief.style}`,
    `화면 비율: ${project.brief.ratio}`,
    `등장인물 설정:\n${project.characters}`,
    `장면: ${scene.visual}`,
    scene.narration.trim() ? `상황: ${scene.narration.trim()}` : '',
    '글자, 자막, 말풍선, 워터마크는 넣지 마세요. 기준 이미지를 첨부했다면 인물의 얼굴과 의상을 그대로 유지해 주세요.',
  ]
    .filter(Boolean)
    .join('\n\n');
}
export function caption(scene: Pick<TScene, 'dialogue' | 'narration'>) {
  return scene.dialogue.trim() || scene.narration.trim();
}
function timestamp(seconds: number, separator = '.') {
  const ms = Math.round(seconds * 1000);
  return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}${separator}${String(ms % 1000).padStart(3, '0')}`;
}
export function sceneDuration(scene: TScene) {
  return scene.voice ? Math.max(2, scene.voice.duration + 0.4) : scene.duration;
}
export function subtitles(scenes: TScene[], format: 'vtt' | 'srt' = 'vtt') {
  const entries = scenes.map((scene, index) => {
    const start = scenes.slice(0, index).reduce((sum, item) => sum + sceneDuration(item), 0);
    const text = caption(scene)
      .replace(/-->/g, '→')
      .replace(/[<>]/g, '')
      .replace(/\n\s*\n/g, '\n');
    return `${index + 1}\n${timestamp(start, format === 'srt' ? ',' : '.')} --> ${timestamp(start + sceneDuration(scene), format === 'srt' ? ',' : '.')}\n${text || ' '}`;
  });
  return `${format === 'vtt' ? 'WEBVTT\n\n' : ''}${entries.join('\n\n')}\n`;
}
export function manuscript(project: TProject) {
  return `# ${project.title}\n\n${project.logline}\n\n## 줄거리\n\n${project.synopsis}\n\n## 등장인물\n\n${project.characters}\n\n${project.scenes.map((scene, index) => `## ${index + 1}. ${scene.title}\n\n${scene.narration}${scene.dialogue ? `\n\n${scene.dialogue}` : ''}${project.brief.format !== 'novel' ? `\n\n장면 묘사: ${scene.visual}\n길이: ${scene.duration}초` : ''}`).join('\n\n')}`;
}
export function safeFilename(title: string) {
  return title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 80) || '나의 작품';
}
