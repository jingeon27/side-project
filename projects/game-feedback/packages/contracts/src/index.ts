import { z } from 'zod';
import { RichTextDocumentSchema } from './rich-text';
export { RichTextDocumentSchema, RichTextAttributesSchema, richTextToPlainText } from './rich-text';
export type { TRichTextDocument, TRichTextAttributes } from './rich-text';

export const BoardKindSchema = z.enum(['FEEDBACK', 'FRIEND_SALE', 'FRIENDLY']);
export type TBoardKind = z.infer<typeof BoardKindSchema>;

const ResponseIdSchema = z.string().min(1).max(100);
const ResponseTimestampSchema = z.iso.datetime();
const ResponseCountSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

export const ErrorSchema = z.object({ errorCode: z.string(), message: z.string().min(1) });
export const OkSchema = z.object({ ok: z.literal(true) });
export const AuthorSchema = z.object({
  id: ResponseIdSchema,
  nickname: z.string().min(1),
  isVerified: z.boolean(),
  supercellTag: z.string().nullable(),
  isTestAccount: z.boolean(),
});
export const UserSchema = AuthorSchema.extend({
  role: z.enum(['USER', 'ADMIN']),
  createdAt: ResponseTimestampSchema,
  verifiedAt: ResponseTimestampSchema.nullable(),
});
export const TestAccountSchema = AuthorSchema.extend({
  role: z.enum(['USER', 'ADMIN']),
  isTestAccount: z.literal(true),
  description: z.string(),
});
export const TestAccountListSchema = z.object({ items: z.array(TestAccountSchema) });
export const TestLoginInputSchema = z.object({ accountId: z.string().min(1).max(100) }).strict();
export const VerificationInputSchema = z.object({ isVerified: z.boolean() }).strict();
export type TestAccount = z.infer<typeof TestAccountSchema>;
export type TestAccountList = z.infer<typeof TestAccountListSchema>;
export const PublicProfileSchema = z.object({
  author: AuthorSchema,
  joinedAt: ResponseTimestampSchema,
  postCount: ResponseCountSchema,
  answerCount: ResponseCountSchema,
  helpfulCount: ResponseCountSchema,
});
export type PublicProfile = z.infer<typeof PublicProfileSchema>;
export const CategorySchema = z.object({
  id: ResponseIdSchema,
  slug: z.string().min(1),
  name: z.string().min(1),
  active: z.boolean(),
});
export const CardSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  level: ResponseCountSchema,
  iconUrl: z.string().nullable(),
});
export const GameProfileSchema = z.object({
  playerTag: z.string().min(1),
  name: z.string().min(1),
  trophies: ResponseCountSchema,
  bestTrophies: ResponseCountSchema,
  arena: z.string().min(1),
  clan: z.string().nullable(),
  deck: z.array(CardSchema),
  verification: z.literal('UNVERIFIED'),
  source: z.enum(['SUPERCELL', 'DEMO']),
  fetchedAt: ResponseTimestampSchema,
});
export const PostSchema = z.object({
  id: ResponseIdSchema,
  title: z.string().min(1),
  body: z.string().min(1),
  board: BoardKindSchema.optional(),
  document: RichTextDocumentSchema.nullable().optional(),
  categoryId: ResponseIdSchema,
  category: CategorySchema,
  author: AuthorSchema,
  gameProfile: GameProfileSchema.nullable(),
  answerCount: ResponseCountSchema,
  helpfulCount: ResponseCountSchema,
  createdAt: ResponseTimestampSchema,
  updatedAt: ResponseTimestampSchema,
});
export const AnswerSchema = z.object({
  id: ResponseIdSchema,
  postId: ResponseIdSchema,
  body: z.string().min(1),
  author: AuthorSchema,
  helpful: z.boolean(),
  readAt: ResponseTimestampSchema.nullable(),
  createdAt: ResponseTimestampSchema,
  updatedAt: ResponseTimestampSchema,
});
export const CommentSchema = z.object({
  id: ResponseIdSchema,
  postId: ResponseIdSchema,
  body: z.string().min(1),
  author: AuthorSchema,
  createdAt: ResponseTimestampSchema,
  updatedAt: ResponseTimestampSchema,
});
export const NotificationSchema = z.object({
  id: ResponseIdSchema,
  type: z.enum(['ANSWER', 'HELPFUL', 'COMMENT']),
  postId: ResponseIdSchema,
  answerId: ResponseIdSchema.nullable(),
  message: z.string().min(1),
  readAt: ResponseTimestampSchema.nullable(),
  createdAt: ResponseTimestampSchema,
});
export const PostListSchema = z.object({
  items: z.array(PostSchema),
  nextCursor: z.string().min(1).nullable(),
});
export const PostDetailSchema = z.object({
  post: PostSchema,
  answers: z.array(AnswerSchema),
  comments: z.array(CommentSchema),
});
export const AdminReportSchema = z.object({
  id: ResponseIdSchema,
  reporterId: ResponseIdSchema,
  targetType: z.string(),
  targetId: ResponseIdSchema,
  reason: z.string(),
  detail: z.string().nullable(),
  status: z.string(),
  createdAt: ResponseTimestampSchema,
});
export const NotificationListSchema = z.object({
  items: z.array(NotificationSchema),
  unreadCount: ResponseCountSchema,
  nextCursor: z.string().min(1).nullable(),
});
export const SessionSchema = z.object({
  user: UserSchema.nullable(),
  demoMode: z.boolean(),
  googleConfigured: z.boolean(),
  needsOnboarding: z.boolean(),
});
export const ChatAttachmentSchema = z.object({
  id: ResponseIdSchema,
  name: z.string().min(1).max(200),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm']),
  size: z
    .number()
    .int()
    .positive()
    .max(25 * 1024 * 1024),
  kind: z.enum(['IMAGE', 'VIDEO']),
  url: z.string().regex(/^\/api\/conversations\/[A-Za-z0-9_-]{1,100}\/attachments\/[A-Za-z0-9_-]{1,100}$/),
});
export type TChatAttachment = z.infer<typeof ChatAttachmentSchema>;
export const ChatAttachmentUploadSchema = z.object({ file: z.string().meta({ format: 'binary' }) });
export const ChatMessageSchema = z.object({
  id: ResponseIdSchema,
  conversationId: ResponseIdSchema,
  sender: AuthorSchema,
  body: z.string().max(2000),
  attachments: z.array(ChatAttachmentSchema).max(4).optional(),
  createdAt: ResponseTimestampSchema,
  clientMessageId: z.uuid(),
});
export const ConversationSchema = z.object({
  id: ResponseIdSchema,
  peer: AuthorSchema,
  lastMessage: ChatMessageSchema.nullable(),
  unreadCount: ResponseCountSchema,
  updatedAt: ResponseTimestampSchema,
  peerLastReadAt: ResponseTimestampSchema.nullable(),
});
export const ConversationListSchema = z.object({
  items: z.array(ConversationSchema),
  nextCursor: z.string().min(1).nullable(),
  unreadCount: ResponseCountSchema,
});
export const ChatMessageListSchema = z.object({
  conversation: ConversationSchema,
  items: z.array(ChatMessageSchema),
  nextCursor: z.string().min(1).nullable(),
});
export const ConversationInputSchema = z.object({ recipientId: z.string().min(1).max(100) }).strict();
export const ChatMessageInputSchema = z
  .object({
    body: z.string().trim().max(2000),
    clientMessageId: z.uuid(),
    attachmentIds: z.array(ResponseIdSchema).max(4).optional(),
  })
  .strict()
  .refine((input) => input.body.length > 0 || (input.attachmentIds?.length ?? 0) > 0)
  .refine((input) => new Set(input.attachmentIds).size === (input.attachmentIds?.length ?? 0));
export const ChatReadInputSchema = z.object({ messageId: z.string().min(1).max(100) }).strict();
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type Conversation = z.infer<typeof ConversationSchema>;
export type ConversationList = z.infer<typeof ConversationListSchema>;
export type ChatMessageList = z.infer<typeof ChatMessageListSchema>;
export const PlayerTagSchema = z
  .string()
  .trim()
  .regex(/^#?[0289PYLQGRJCUV]{3,15}$/i, '올바른 플레이어 태그를 입력해주세요.')
  .transform((value) => `#${value.replace(/^#/, '').toUpperCase()}`);
export const NicknameSchema = z
  .string()
  .trim()
  .min(2)
  .max(24)
  .regex(/^[\p{L}\p{N}_ .-]+$/u);
export const OnboardInputSchema = z
  .object({ nickname: NicknameSchema, acceptedTerms: z.literal(true), ageConfirmed: z.literal(true) })
  .strict();
export const AppExchangeInputSchema = z
  .object({
    code: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    verifier: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  })
  .strict();
export const DemoInputSchema = z.object({ nickname: NicknameSchema }).strict();
export const PostInputSchema = z
  .object({
    title: z.string().trim().min(4).max(120),
    body: z.string().trim().min(20).max(10000),
    board: BoardKindSchema.optional(),
    document: RichTextDocumentSchema.nullable().optional(),
    categoryId: z.string().min(1),
    playerTag: PlayerTagSchema.optional(),
  })
  .strict();
export const PostPatchSchema = PostInputSchema.omit({ categoryId: true, board: true })
  .partial()
  .refine((v) => Object.keys(v).length > 0);
export const AnswerInputSchema = z.object({ body: z.string().trim().min(10).max(10000) }).strict();
export const CommentInputSchema = z.object({ body: z.string().trim().min(1).max(2000) }).strict();
export const HelpfulInputSchema = z.object({ helpful: z.boolean() }).strict();
export const GameAccountInputSchema = z.object({ playerTag: PlayerTagSchema }).strict();
export const ReportInputSchema = z
  .object({
    targetType: z.enum(['POST', 'ANSWER', 'COMMENT']),
    targetId: z.string().min(1),
    reason: z.enum(['SPAM', 'HARASSMENT', 'PERSONAL_INFORMATION', 'IMPERSONATION', 'OTHER']),
    detail: z.string().trim().max(1000).optional(),
  })
  .strict();
export const BlockInputSchema = z.object({ blockedUserId: z.string().min(1) }).strict();
export const CategoryInputSchema = z
  .object({
    slug: z
      .string()
      .regex(/^[a-z0-9-]+$/)
      .max(40),
    name: z.string().trim().min(1).max(50),
  })
  .strict();
export const HideInputSchema = z
  .object({
    targetType: z.enum(['POST', 'ANSWER', 'COMMENT']),
    targetId: z.string().min(1),
    hidden: z.boolean(),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();
export const ListQuerySchema = z.object({
  board: z.union([BoardKindSchema, z.literal('ALL')]).optional(),
  authorId: z.string().min(1).max(100).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(12),
  category: z.string().max(80).optional(),
  unanswered: z.enum(['true', 'false']).optional(),
  q: z.string().trim().max(100).optional(),
});
export type User = z.infer<typeof UserSchema>;
export type Author = z.infer<typeof AuthorSchema>;
export type Category = z.infer<typeof CategorySchema>;
export type Card = z.infer<typeof CardSchema>;
export type GameProfile = z.infer<typeof GameProfileSchema>;
export type Post = z.infer<typeof PostSchema>;
export type Answer = z.infer<typeof AnswerSchema>;
export type Comment = z.infer<typeof CommentSchema>;
export type Notification = z.infer<typeof NotificationSchema>;
export type Session = z.infer<typeof SessionSchema>;
export type PostList = z.infer<typeof PostListSchema>;
export type PostDetail = z.infer<typeof PostDetailSchema>;
export type NotificationList = z.infer<typeof NotificationListSchema>;
export type PostInput = z.input<typeof PostInputSchema>;
export type ReportInput = z.infer<typeof ReportInputSchema>;

export const schemas = {
  RichTextDocument: RichTextDocumentSchema,
  ChatAttachment: ChatAttachmentSchema,
  ChatAttachmentUpload: ChatAttachmentUploadSchema,
  AppExchangeInput: AppExchangeInputSchema,
  TestAccount: TestAccountSchema,
  TestAccountList: TestAccountListSchema,
  TestLoginInput: TestLoginInputSchema,
  VerificationInput: VerificationInputSchema,
  ChatMessage: ChatMessageSchema,
  Conversation: ConversationSchema,
  ConversationList: ConversationListSchema,
  ChatMessageList: ChatMessageListSchema,
  ConversationInput: ConversationInputSchema,
  ChatMessageInput: ChatMessageInputSchema,
  ChatReadInput: ChatReadInputSchema,
  AdminReport: AdminReportSchema,
  Error: ErrorSchema,
  Ok: OkSchema,
  PublicProfile: PublicProfileSchema,
  User: UserSchema,
  Author: AuthorSchema,
  Category: CategorySchema,
  Card: CardSchema,
  GameProfile: GameProfileSchema,
  Post: PostSchema,
  Answer: AnswerSchema,
  Comment: CommentSchema,
  Notification: NotificationSchema,
  PostList: PostListSchema,
  PostDetail: PostDetailSchema,
  NotificationList: NotificationListSchema,
  Session: SessionSchema,
  OnboardInput: OnboardInputSchema,
  DemoInput: DemoInputSchema,
  PostInput: PostInputSchema,
  PostPatch: PostPatchSchema,
  AnswerInput: AnswerInputSchema,
  CommentInput: CommentInputSchema,
  HelpfulInput: HelpfulInputSchema,
  GameAccountInput: GameAccountInputSchema,
  ReportInput: ReportInputSchema,
  BlockInput: BlockInputSchema,
  CategoryInput: CategoryInputSchema,
  HideInput: HideInputSchema,
};
export type OperationSpec = {
  method: 'get' | 'post' | 'patch' | 'delete';
  path: string;
  id: string;
  response: z.ZodType;
  body?: z.ZodType;
  contentType?: 'multipart/form-data';
  query?: boolean;
};
export const operations: OperationSpec[] = [
  { method: 'get', path: '/api/users/{id}', id: 'getPublicProfile', response: PublicProfileSchema },
  {
    method: 'post',
    path: '/api/auth/app/exchange',
    id: 'exchangeAppLogin',
    body: AppExchangeInputSchema,
    response: SessionSchema,
  },
  { method: 'get', path: '/api/auth/test-accounts', id: 'listTestAccounts', response: TestAccountListSchema },
  {
    method: 'post',
    path: '/api/auth/test-login',
    id: 'testAccountLogin',
    body: TestLoginInputSchema,
    response: SessionSchema,
  },
  {
    method: 'patch',
    path: '/api/admin/users/{id}/verification',
    id: 'setUserVerification',
    body: VerificationInputSchema,
    response: UserSchema,
  },
  {
    method: 'get',
    path: '/api/conversations',
    id: 'listConversations',
    response: ConversationListSchema,
    query: true,
  },
  {
    method: 'post',
    path: '/api/conversations',
    id: 'createConversation',
    body: ConversationInputSchema,
    response: ConversationSchema,
  },
  {
    method: 'get',
    path: '/api/conversations/{id}/messages',
    id: 'listChatMessages',
    response: ChatMessageListSchema,
    query: true,
  },
  {
    method: 'post',
    path: '/api/conversations/{id}/messages',
    id: 'sendChatMessage',
    body: ChatMessageInputSchema,
    response: ChatMessageSchema,
  },
  {
    method: 'post',
    path: '/api/conversations/{id}/attachments',
    id: 'uploadChatAttachment',
    body: ChatAttachmentUploadSchema,
    contentType: 'multipart/form-data',
    response: ChatAttachmentSchema,
  },
  {
    method: 'delete',
    path: '/api/conversations/{id}/attachments/{attachmentId}',
    id: 'deleteChatAttachment',
    response: OkSchema,
  },
  {
    method: 'post',
    path: '/api/conversations/{id}/read',
    id: 'readConversation',
    body: ChatReadInputSchema,
    response: OkSchema,
  },
  { method: 'get', path: '/api/health', id: 'getHealth', response: OkSchema },
  { method: 'get', path: '/api/admin/reports', id: 'listReports', response: z.array(AdminReportSchema) },
  { method: 'get', path: '/api/session', id: 'getSession', response: SessionSchema },
  { method: 'post', path: '/api/auth/demo', id: 'demoLogin', body: DemoInputSchema, response: SessionSchema },
  {
    method: 'post',
    path: '/api/auth/onboard',
    id: 'onboard',
    body: OnboardInputSchema,
    response: SessionSchema,
  },
  { method: 'post', path: '/api/auth/logout', id: 'logout', response: OkSchema },
  { method: 'delete', path: '/api/me', id: 'deleteAccount', response: OkSchema },
  { method: 'get', path: '/api/categories', id: 'listCategories', response: z.array(CategorySchema) },
  { method: 'get', path: '/api/posts', id: 'listPosts', response: PostListSchema, query: true },
  { method: 'post', path: '/api/posts', id: 'createPost', body: PostInputSchema, response: PostSchema },
  { method: 'get', path: '/api/posts/{id}', id: 'getPost', response: PostDetailSchema },
  { method: 'patch', path: '/api/posts/{id}', id: 'updatePost', body: PostPatchSchema, response: PostSchema },
  { method: 'delete', path: '/api/posts/{id}', id: 'deletePost', response: OkSchema },
  {
    method: 'post',
    path: '/api/posts/{id}/answers',
    id: 'createAnswer',
    body: AnswerInputSchema,
    response: AnswerSchema,
  },
  {
    method: 'patch',
    path: '/api/answers/{id}',
    id: 'updateAnswer',
    body: AnswerInputSchema,
    response: AnswerSchema,
  },
  { method: 'delete', path: '/api/answers/{id}', id: 'deleteAnswer', response: OkSchema },
  {
    method: 'post',
    path: '/api/answers/{id}/helpful',
    id: 'markHelpful',
    body: HelpfulInputSchema,
    response: AnswerSchema,
  },
  { method: 'post', path: '/api/posts/{id}/read', id: 'readAnswers', response: OkSchema },
  {
    method: 'post',
    path: '/api/posts/{id}/comments',
    id: 'createComment',
    body: CommentInputSchema,
    response: CommentSchema,
  },
  {
    method: 'patch',
    path: '/api/comments/{id}',
    id: 'updateComment',
    body: CommentInputSchema,
    response: CommentSchema,
  },
  { method: 'delete', path: '/api/comments/{id}', id: 'deleteComment', response: OkSchema },
  {
    method: 'get',
    path: '/api/game-profiles/{playerTag}',
    id: 'getGameProfile',
    response: GameProfileSchema,
  },
  {
    method: 'get',
    path: '/api/me/game-accounts',
    id: 'listGameAccounts',
    response: z.array(GameProfileSchema),
  },
  {
    method: 'post',
    path: '/api/me/game-accounts',
    id: 'saveGameAccount',
    body: GameAccountInputSchema,
    response: GameProfileSchema,
  },
  {
    method: 'get',
    path: '/api/notifications',
    id: 'listNotifications',
    response: NotificationListSchema,
    query: true,
  },
  { method: 'post', path: '/api/notifications/{id}/read', id: 'readNotification', response: OkSchema },
  { method: 'post', path: '/api/notifications/read-all', id: 'readAllNotifications', response: OkSchema },
  { method: 'post', path: '/api/reports', id: 'createReport', body: ReportInputSchema, response: OkSchema },
  { method: 'get', path: '/api/blocks', id: 'listBlocks', response: z.array(AuthorSchema) },
  { method: 'post', path: '/api/blocks', id: 'blockUser', body: BlockInputSchema, response: OkSchema },
  { method: 'delete', path: '/api/blocks/{id}', id: 'unblockUser', response: OkSchema },
  {
    method: 'post',
    path: '/api/admin/categories',
    id: 'createCategory',
    body: CategoryInputSchema,
    response: CategorySchema,
  },
  { method: 'post', path: '/api/admin/hide', id: 'hideContent', body: HideInputSchema, response: OkSchema },
];
