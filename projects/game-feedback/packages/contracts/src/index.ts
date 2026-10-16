import { z } from 'zod';

export const ErrorSchema = z.object({ errorCode: z.string(), message: z.string() });
export const OkSchema = z.object({ ok: z.literal(true) });
export const AuthorSchema = z.object({
  id: z.string(),
  nickname: z.string(),
  isVerified: z.boolean(),
  supercellTag: z.string().nullable(),
  isTestAccount: z.boolean(),
});
export const UserSchema = AuthorSchema.extend({
  role: z.enum(['USER', 'ADMIN']),
  createdAt: z.string(),
  verifiedAt: z.string().nullable(),
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
export const CategorySchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  active: z.boolean(),
});
export const CardSchema = z.object({
  id: z.number(),
  name: z.string(),
  level: z.number(),
  iconUrl: z.string().nullable(),
});
export const GameProfileSchema = z.object({
  playerTag: z.string(),
  name: z.string(),
  trophies: z.number(),
  bestTrophies: z.number(),
  arena: z.string(),
  clan: z.string().nullable(),
  deck: z.array(CardSchema),
  verification: z.literal('UNVERIFIED'),
  source: z.enum(['SUPERCELL', 'DEMO']),
  fetchedAt: z.string(),
});
export const PostSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  categoryId: z.string(),
  category: CategorySchema,
  author: AuthorSchema,
  gameProfile: GameProfileSchema.nullable(),
  answerCount: z.number(),
  helpfulCount: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export const AnswerSchema = z.object({
  id: z.string(),
  postId: z.string(),
  body: z.string(),
  author: AuthorSchema,
  helpful: z.boolean(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export const CommentSchema = z.object({
  id: z.string(),
  postId: z.string(),
  body: z.string(),
  author: AuthorSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export const NotificationSchema = z.object({
  id: z.string(),
  type: z.enum(['ANSWER', 'HELPFUL', 'COMMENT']),
  postId: z.string(),
  answerId: z.string().nullable(),
  message: z.string(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});
export const PostListSchema = z.object({ items: z.array(PostSchema), nextCursor: z.string().nullable() });
export const PostDetailSchema = z.object({
  post: PostSchema,
  answers: z.array(AnswerSchema),
  comments: z.array(CommentSchema),
});
export const AdminReportSchema = z.object({
  id: z.string(),
  reporterId: z.string(),
  targetType: z.string(),
  targetId: z.string(),
  reason: z.string(),
  detail: z.string().nullable(),
  status: z.string(),
  createdAt: z.string(),
});
export const NotificationListSchema = z.object({
  items: z.array(NotificationSchema),
  unreadCount: z.number(),
  nextCursor: z.string().nullable(),
});
export const SessionSchema = z.object({
  user: UserSchema.nullable(),
  demoMode: z.boolean(),
  googleConfigured: z.boolean(),
  needsOnboarding: z.boolean(),
});
export const ChatMessageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  sender: AuthorSchema,
  body: z.string(),
  createdAt: z.string(),
  clientMessageId: z.string(),
});
export const ConversationSchema = z.object({
  id: z.string(),
  peer: AuthorSchema,
  lastMessage: ChatMessageSchema.nullable(),
  unreadCount: z.number(),
  updatedAt: z.string(),
  peerLastReadAt: z.string().nullable(),
});
export const ConversationListSchema = z.object({
  items: z.array(ConversationSchema),
  nextCursor: z.string().nullable(),
  unreadCount: z.number(),
});
export const ChatMessageListSchema = z.object({
  conversation: ConversationSchema,
  items: z.array(ChatMessageSchema),
  nextCursor: z.string().nullable(),
});
export const ConversationInputSchema = z.object({ recipientId: z.string().min(1).max(100) }).strict();
export const ChatMessageInputSchema = z
  .object({ body: z.string().trim().min(1).max(2000), clientMessageId: z.uuid() })
  .strict();
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
export const DemoInputSchema = z.object({ nickname: NicknameSchema }).strict();
export const PostInputSchema = z
  .object({
    title: z.string().trim().min(4).max(120),
    body: z.string().trim().min(20).max(10000),
    categoryId: z.string().min(1),
    playerTag: PlayerTagSchema.optional(),
  })
  .strict();
export const PostPatchSchema = PostInputSchema.omit({ categoryId: true })
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
  query?: boolean;
};
export const operations: OperationSpec[] = [
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
