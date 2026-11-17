import { z } from 'zod';

export const speakerIds = [
  'sohee',
  'ryan',
  'aiden',
  'serena',
  'vivian',
  'uncle_fu',
  'ono_anna',
  'eric',
  'dylan',
] as const;
export const presetVoices = {
  sohee: '소희, 한국어 여성',
  ryan: '라이언, 영어 남성',
  aiden: '에이든, 영어 남성',
  serena: '세레나, 중국어 여성',
  vivian: '비비안, 중국어 여성',
  uncle_fu: '푸, 중후한 중국어 남성',
  ono_anna: '안나, 일본어 여성',
  eric: '에릭, 중국어 남성',
  dylan: '딜런, 중국어 남성',
} as const satisfies Record<(typeof speakerIds)[number], string>;
export const voiceStyles = {
  calm: '차분한 이야기',
  neutral: '자연스럽게',
  bright: '밝고 활기차게',
  firm: '단호하게',
} as const;
export const voiceIdSchema = z
  .string()
  .uuid()
  .regex(/^[a-f0-9-]+$/);
export const voiceRunIdSchema = z.string().regex(/^local-[a-f0-9-]{36}$/);
export const voiceSettingsSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('preset'),
    speaker: z.enum(speakerIds),
    style: z.enum(['calm', 'neutral', 'bright', 'firm']),
  }),
  z.object({ kind: z.literal('trained'), runId: voiceRunIdSchema }),
]);
export type TVoiceSettings = z.infer<typeof voiceSettingsSchema>;
export const defaultVoiceSettings = {
  kind: 'preset',
  speaker: 'sohee',
  style: 'calm',
} as const satisfies TVoiceSettings;
export const voiceNameSchema = z.object({
  name: z.string().trim().min(1, '목소리 이름을 입력해 주세요').max(60),
});
export const voiceDatasetSchema = voiceNameSchema.extend({
  id: voiceIdSchema,
  createdAt: z.string().datetime(),
});
export const voiceSampleInputSchema = z.object({
  transcript: z.string().trim().min(3, '녹음한 대본을 입력해 주세요').max(2000),
});
export const voiceSampleSchema = voiceSampleInputSchema.extend({
  id: voiceIdSchema,
  filename: z.string().max(160),
  duration: z.number().min(1).max(30),
  asset: z.string().regex(/^\/api\/assets\/[a-f0-9-]{36}\.wav$/),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  audioHash: z.string().regex(/^[a-f0-9]{64}$/),
});
export const voiceRunInputSchema = z.object({ epochs: z.number().int().min(1).max(20).default(3) });
export const voiceRunConfigSchema = voiceRunInputSchema.extend({
  id: voiceRunIdSchema,
  voiceId: voiceIdSchema,
  sampleIds: z.array(voiceIdSchema).min(2).max(50),
  datasetHash: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: z.string().datetime(),
});
export const voiceRunSchema = z.object({
  id: voiceRunIdSchema,
  voiceId: voiceIdSchema,
  status: z.enum(['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED']),
  step: z.number().int().min(0),
  total: z.number().int().min(1).max(1000),
  progress: z.string().max(200).optional(),
  error: z.string().max(400).optional(),
  loss: z.number().finite().optional(),
  gradientNorm: z.number().finite().optional(),
  peakMemoryGiB: z.number().finite().nonnegative().optional(),
  trainableParameters: z.number().int().positive().optional(),
  checkpoint: z
    .string()
    .regex(/^step-\d{6}$/)
    .optional(),
});
export const trainedVoiceSchema = z.object({
  voiceId: voiceIdSchema,
  runId: voiceRunIdSchema,
  name: z.string().min(1).max(60),
});
export type TVoiceSample = z.infer<typeof voiceSampleSchema>;
export type TVoiceRun = z.infer<typeof voiceRunSchema>;
export type TTrainedVoice = z.infer<typeof trainedVoiceSchema>;
export const voiceCatalogSchema = z.object({
  voices: z.array(voiceDatasetSchema),
  trained: z.array(trainedVoiceSchema),
  trainingReady: z.boolean(),
});
export const voiceDetailSchema = z.object({
  voice: voiceDatasetSchema,
  samples: z.array(voiceSampleSchema),
  runs: z.array(voiceRunSchema),
  trainingReady: z.boolean(),
});
