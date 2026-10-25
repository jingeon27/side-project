import { z } from 'zod';

import {
  AvatarUploadInputSchema,
  MediaMimeTypeSchema,
  MediaSizeSchema,
  MediaUploadInputSchema,
  MediaUploadPlanSchema,
} from './media-upload';
import { PostMediaSchema } from './post-media';
import { ProfileLinksSchema, UpdateProfileInputSchema } from './profile';
import { RichTextDocumentSchema } from './rich-text';

export { ProfileLinkSchema, ProfileLinksSchema, UpdateProfileInputSchema } from './profile';

export {
  POSTS_CACHE_TAG,
  DISCOVERY_CACHE_TAG,
  CacheTagSchema,
  CacheRevalidationSchema,
  postCacheTag,
} from './cache-revalidation';

export { AvatarUploadInputSchema, MediaUploadInputSchema, MediaUploadPlanSchema } from './media-upload';
export type { TMediaUploadInput, TMediaUploadPlan } from './media-upload';
export {
  RichTextDocumentSchema,
  RichTextAttributesSchema,
  richTextToPlainText,
  richTextMediaReferences,
} from './rich-text';
export type { TRichTextDocument, TRichTextAttributes } from './rich-text';
export { PostMediaSchema, PostMediaUrlSchema, RichTextEmbedSchema } from './post-media';
export type { TPostMedia, TRichTextEmbed } from './post-media';

export const RegisterPushDeviceSchema = z
  .object({
    installationId: z.uuidv4(),
    token: z.string().regex(/^(?:Expo|Exponent)PushToken\[[A-Za-z0-9_-]{16,200}\]$/),
    platform: z.enum(['ios', 'android']),
    locale: z.enum(['ko', 'en', 'ja']),
  })
  .strict();
export const PushDeviceStatusSchema = z.object({ ok: z.literal(true), enabled: z.boolean() });
export const UnregisterPushDeviceSchema = z.object({ installationId: z.uuidv4() }).strict();

export const BoardKindSchema = z.enum(['FEEDBACK', 'FRIEND_SALE', 'FRIENDLY', 'COACHING', 'FREE']);
export type TBoardKind = z.infer<typeof BoardKindSchema>;
export const CoachingPricingTypeSchema = z.enum(['HOURLY', 'MONTHLY', 'GOAL']);
export type TCoachingPricingType = z.infer<typeof CoachingPricingTypeSchema>;
const CoachingAmountSchema = z.number().int().positive().max(10000000).nullable();
export const CoachingPricingSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('HOURLY'), amount: CoachingAmountSchema }).strict(),
  z.object({ type: z.literal('MONTHLY'), amount: CoachingAmountSchema }).strict(),
  z
    .object({
      type: z.literal('GOAL'),
      amount: CoachingAmountSchema,
      targetScore: z.string().trim().min(1).max(100),
    })
    .strict(),
]);
export type TCoachingPricing = z.infer<typeof CoachingPricingSchema>;
export const CoachingRoleSchema = z.enum(['COACH', 'STUDENT']);
export type TCoachingRole = z.infer<typeof CoachingRoleSchema>;
export const CoachingDetailsSchema = z
  .object({
    role: CoachingRoleSchema,
    pricing: CoachingPricingSchema,
  })
  .strict();
export type TCoachingDetails = z.infer<typeof CoachingDetailsSchema>;

export const FriendSaleDetailsSchema = z
  .object({ price: z.number().int().positive().max(10000000).nullable() })
  .strict();
export type TFriendSaleDetails = z.infer<typeof FriendSaleDetailsSchema>;

export const BattleModeSchema = z.enum(['DUEL', 'TEAM']);
export type TBattleMode = z.infer<typeof BattleModeSchema>;
export const BattleDetailsSchema = z.object({ mode: BattleModeSchema }).strict();
export type TBattleDetails = z.infer<typeof BattleDetailsSchema>;

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
  avatarUrl: z.string().nullable().optional(),
});
export const UserSchema = AuthorSchema.extend({
  role: z.enum(['USER', 'ADMIN']),
  createdAt: ResponseTimestampSchema,
  verifiedAt: ResponseTimestampSchema.nullable(),
  bannedAt: ResponseTimestampSchema.nullable().optional(),
  banReason: z.string().nullable().optional(),
});
export const TestAccountSchema = AuthorSchema.extend({
  role: z.enum(['USER', 'ADMIN']),
  isTestAccount: z.literal(true),
  description: z.string(),
});
export const TestAccountListSchema = z.object({ items: z.array(TestAccountSchema) });
export const TestLoginInputSchema = z.object({ accountId: z.string().min(1).max(100) }).strict();
export const SocialProviderSchema = z.enum(['kakao', 'discord', 'google']);
export type TSocialProvider = z.infer<typeof SocialProviderSchema>;
export const TestTokenSchema = z.object({
  accessToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  tokenType: z.literal('Bearer'),
  expiresAt: ResponseTimestampSchema,
  user: UserSchema,
});
export const VerificationInputSchema = z.object({ isVerified: z.boolean() }).strict();
export const FollowInputSchema = z.object({ notifyNewPosts: z.boolean() }).strict();
export const FollowStatusSchema = z.object({ following: z.boolean(), notifyNewPosts: z.boolean() });
export type TFollowInput = z.infer<typeof FollowInputSchema>;
export type TFollowStatus = z.infer<typeof FollowStatusSchema>;
export type TestAccount = z.infer<typeof TestAccountSchema>;
export type TestAccountList = z.infer<typeof TestAccountListSchema>;
export const PublicProfileSchema = z.object({
  author: AuthorSchema,
  links: ProfileLinksSchema.optional(),
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
  coaching: CoachingDetailsSchema.nullable().optional(),
  friendSale: FriendSaleDetailsSchema.nullable().optional(),
  battle: BattleDetailsSchema.nullable().optional(),
  categoryId: ResponseIdSchema,
  category: CategorySchema,
  author: AuthorSchema,
  gameProfile: GameProfileSchema.nullable(),
  viewCount: ResponseCountSchema,
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
const CommentFields = {
  id: ResponseIdSchema,
  postId: ResponseIdSchema,
  createdAt: ResponseTimestampSchema,
  updatedAt: ResponseTimestampSchema,
};
export const CommentSchema = z.discriminatedUnion('isDeleted', [
  z.object({
    ...CommentFields,
    parentId: ResponseIdSchema.nullable(),
    isDeleted: z.literal(false),
    body: z.string().min(1),
    author: AuthorSchema,
  }),
  z.object({
    ...CommentFields,
    parentId: z.null(),
    isDeleted: z.literal(true),
    body: z.literal(''),
    author: z.null(),
  }),
]);
const NotificationBaseSchema = z.object({
  id: ResponseIdSchema,
  /** 알림을 만든 사용자의 현재 공개 정보. 탈퇴 등으로 없으면 null이다. 문구는 클라이언트가 번역해 조합한다. */
  actor: AuthorSchema.nullable(),
  readAt: ResponseTimestampSchema.nullable(),
  createdAt: ResponseTimestampSchema,
});
export const NotificationSchema = z.discriminatedUnion('type', [
  NotificationBaseSchema.extend({
    type: z.enum(['ANSWER', 'HELPFUL', 'COMMENT', 'COMMENT_REPLY', 'FOLLOWED_POST']),
    postId: ResponseIdSchema,
    answerId: ResponseIdSchema.nullable(),
    commentId: ResponseIdSchema.nullable().optional(),
    /** 대상 게시글의 현재 제목. 작성 당시 값을 저장하지 않는다. */
    postTitle: z.string().min(1),
  }),
  NotificationBaseSchema.extend({
    type: z.literal('CHAT_MESSAGE'),
    conversationId: ResponseIdSchema,
    postId: z.null(),
    postTitle: z.null(),
    answerId: z.null(),
    commentId: z.null().optional(),
  }),
]);
export const PostListSchema = z.object({
  items: z.array(PostSchema),
  nextCursor: z.string().min(1).nullable(),
});
/** 최근 원댓글 스레드부터 나눈 댓글 한 페이지. 페이지 안은 오래된 순이고 각 원댓글의 답글을 함께 싣는다. */
export const CommentPageSchema = z.object({
  items: z.array(CommentSchema),
  nextCursor: z.string().min(1).nullable(),
});
export const PostDetailSchema = z.object({
  post: PostSchema,
  answers: z.array(AnswerSchema),
  comments: z.array(CommentSchema),
  /** 상세에 싣지 않은 이전 원댓글 스레드를 `listPostComments`로 받는 커서. 없으면 null. */
  commentsCursor: z.string().min(1).nullable(),
});
export const PostViewInputSchema = z.object({ visitorId: z.uuid() }).strict();
export const PostViewSchema = z.object({ viewCount: ResponseCountSchema });
export const ReportStatusSchema = z.enum(['OPEN', 'REVIEWED', 'DISMISSED']);
export type TReportStatus = z.infer<typeof ReportStatusSchema>;
export const AdminReportSchema = z.object({
  targetPostId: ResponseIdSchema.nullable().optional(),
  targetPreview: z.string().nullable().optional(),
  targetUserId: ResponseIdSchema.nullable().optional(),
  id: ResponseIdSchema,
  reporterId: ResponseIdSchema,
  targetType: z.string(),
  targetId: ResponseIdSchema,
  reason: z.string(),
  detail: z.string().nullable(),
  status: z.string(),
  createdAt: ResponseTimestampSchema,
});
export const AdminReportListSchema = z.object({
  items: z.array(AdminReportSchema),
  nextCursor: z.string().min(1).nullable(),
});
export const AdminReportListQuerySchema = z.object({
  status: ReportStatusSchema.default('OPEN'),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(12),
});
export const NotificationListSchema = z.object({
  items: z.array(NotificationSchema),
  unreadCount: ResponseCountSchema,
  nextCursor: z.string().min(1).nullable(),
});
export const SessionSchema = z.object({
  socialProviders: z.array(z.object({ provider: SocialProviderSchema, configured: z.boolean() })).optional(),
  user: UserSchema.nullable(),
  demoMode: z.boolean(),
  googleConfigured: z.boolean(),
  needsOnboarding: z.boolean(),
});
export const ChatAttachmentSchema = z.object({
  id: ResponseIdSchema,
  name: z.string().min(1).max(200),
  mimeType: MediaMimeTypeSchema,
  size: MediaSizeSchema,
  kind: z.enum(['IMAGE', 'VIDEO']),
  url: z.string().regex(/^\/api\/conversations\/[A-Za-z0-9_-]{1,100}\/attachments\/[A-Za-z0-9_-]{1,100}$/),
});
export type TChatAttachment = z.infer<typeof ChatAttachmentSchema>;
export const ChatMessageSchema = z.object({
  id: ResponseIdSchema,
  conversationId: ResponseIdSchema,
  sender: AuthorSchema,
  body: z.string().max(2000),
  attachments: z.array(ChatAttachmentSchema).max(4).optional(),
  createdAt: ResponseTimestampSchema,
  clientMessageId: z.uuid(),
});
export const SupportTopicSchema = z.enum(['GENERAL', 'VERIFICATION']);
export const ConversationSchema = z.object({
  supportTopic: SupportTopicSchema.nullable().optional(),
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
export const ClearChatHistoryInputSchema = z.object({ throughMessageId: ResponseIdSchema }).strict();
export const ChatReadInputSchema = z.object({ messageId: z.string().min(1).max(100) }).strict();
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type Conversation = z.infer<typeof ConversationSchema>;
export type ConversationList = z.infer<typeof ConversationListSchema>;
export type ChatMessageList = z.infer<typeof ChatMessageListSchema>;
export const PLAYER_TAG_PATTERN = /^#?[A-Za-z0-9]{1,15}$/;
export const PlayerTagSchema = z
  .string()
  .trim()
  .regex(PLAYER_TAG_PATTERN, '# 뒤에 영문과 숫자로 된 플레이어 태그를 입력해주세요.')
  .transform((value) => `#${value.replace(/^#/, '').toUpperCase()}`);
export const NicknameSchema = z
  .string()
  .trim()
  .min(2)
  .max(24)
  .regex(/^[\p{L}\p{N}_ .-]+$/u);
export const OnboardInputSchema = z
  .object({
    nickname: NicknameSchema,
    acceptedTerms: z.literal(true),
    ageConfirmed: z.literal(true),
    playerTag: PlayerTagSchema.optional(),
  })
  .strict();
export const AppExchangeInputSchema = z
  .object({
    code: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    verifier: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  })
  .strict();
export const DemoInputSchema = z.object({ nickname: NicknameSchema }).strict();
export const POST_TITLE_MAX_LENGTH = 60;
export const PostInputSchema = z
  .object({
    title: z.string().trim().min(4).max(POST_TITLE_MAX_LENGTH),
    body: z.string().trim().min(1).max(10000),
    board: BoardKindSchema.optional(),
    document: RichTextDocumentSchema.nullable().optional(),
    coaching: CoachingDetailsSchema.nullable().optional(),
    friendSale: FriendSaleDetailsSchema.nullable().optional(),
    battle: BattleDetailsSchema.nullable().optional(),
    categoryId: z.string().min(1),
  })
  .strict();
export const PostPatchSchema = PostInputSchema.omit({ categoryId: true, board: true })
  .partial()
  .refine((v) => Object.keys(v).length > 0);
export const AnswerInputSchema = z.object({ body: z.string().trim().min(10).max(10000) }).strict();
export const CommentInputSchema = z.object({ body: z.string().trim().min(1).max(2000) }).strict();
export const CreateCommentInputSchema = CommentInputSchema.extend({
  parentId: ResponseIdSchema.nullable().optional(),
});
export type CreateCommentInput = z.infer<typeof CreateCommentInputSchema>;
export const HelpfulInputSchema = z.object({ helpful: z.boolean() }).strict();
export const GameAccountInputSchema = z.object({ playerTag: PlayerTagSchema }).strict();
export const ReportInputSchema = z
  .object({
    targetType: z.enum(['POST', 'ANSWER', 'COMMENT', 'USER']),
    targetId: z.string().min(1),
    reason: z.enum(['SPAM', 'HARASSMENT', 'PERSONAL_INFORMATION', 'IMPERSONATION', 'FRAUD', 'OTHER']),
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
export const FeedbackStatusSchema = z.enum(['WAITING', 'ANSWERED']);
export type TFeedbackStatus = z.infer<typeof FeedbackStatusSchema>;

export const ListQuerySchema = z.object({
  battleMode: BattleModeSchema.optional(),
  coachingRole: CoachingRoleSchema.optional(),
  feedbackStatus: FeedbackStatusSchema.optional(),
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
export type CommentPage = z.infer<typeof CommentPageSchema>;
export type NotificationList = z.infer<typeof NotificationListSchema>;
export type PostInput = z.input<typeof PostInputSchema>;
export type ReportInput = z.infer<typeof ReportInputSchema>;

export const UserBanInputSchema = z
  .object({ banned: z.boolean(), reason: z.string().trim().min(1).max(500) })
  .strict();
export const ReportReviewInputSchema = z.object({ status: z.enum(['REVIEWED', 'DISMISSED']) }).strict();
export const SupportInputSchema = z.object({ topic: SupportTopicSchema }).strict();
export const SupportStatusInputSchema = z.object({ status: z.enum(['OPEN', 'CLOSED']) }).strict();
export const SupportThreadSchema = z.object({
  id: ResponseIdSchema,
  conversationId: ResponseIdSchema,
  requester: AuthorSchema,
  adminId: ResponseIdSchema,
  topic: SupportTopicSchema,
  status: z.enum(['OPEN', 'CLOSED']),
  createdAt: ResponseTimestampSchema,
  updatedAt: ResponseTimestampSchema,
});
export type TSupportThread = z.infer<typeof SupportThreadSchema>;

export const schemas = {
  UserBanInput: UserBanInputSchema,
  ReportReviewInput: ReportReviewInputSchema,
  SupportInput: SupportInputSchema,
  SupportStatusInput: SupportStatusInputSchema,
  SupportThread: SupportThreadSchema,
  PostMedia: PostMediaSchema,
  MediaUploadInput: MediaUploadInputSchema,
  AvatarUploadInput: AvatarUploadInputSchema,
  MediaUploadPlan: MediaUploadPlanSchema,
  CoachingPricing: CoachingPricingSchema,
  CoachingPricingType: CoachingPricingTypeSchema,
  CoachingDetails: CoachingDetailsSchema,
  FriendSaleDetails: FriendSaleDetailsSchema,
  RichTextDocument: RichTextDocumentSchema,
  ChatAttachment: ChatAttachmentSchema,
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
  AdminReportList: AdminReportListSchema,
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
  CommentPage: CommentPageSchema,
  NotificationList: NotificationListSchema,
  Session: SessionSchema,
  OnboardInput: OnboardInputSchema,
  DemoInput: DemoInputSchema,
  PostInput: PostInputSchema,
  PostPatch: PostPatchSchema,
  AnswerInput: AnswerInputSchema,
  CommentInput: CommentInputSchema,
  CreateCommentInput: CreateCommentInputSchema,
  HelpfulInput: HelpfulInputSchema,
  GameAccountInput: GameAccountInputSchema,
  ReportInput: ReportInputSchema,
  BlockInput: BlockInputSchema,
  CategoryInput: CategoryInputSchema,
  HideInput: HideInputSchema,
};
export type OperationSpec = {
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  path: string;
  id: string;
  response: z.ZodType;
  body?: z.ZodType;
  query?: boolean;
};
export const operations: OperationSpec[] = [
  {
    method: 'post',
    path: '/api/post-media/uploads',
    id: 'requestPostMediaUpload',
    body: MediaUploadInputSchema,
    response: MediaUploadPlanSchema,
  },
  {
    method: 'post',
    path: '/api/post-media/{id}/complete',
    id: 'completePostMediaUpload',
    response: PostMediaSchema,
  },
  { method: 'get', path: '/api/admin/users/{id}', id: 'getAdminUser', response: UserSchema },
  { method: 'delete', path: '/api/post-media/{id}', id: 'deletePostMedia', response: OkSchema },
  {
    method: 'patch',
    path: '/api/admin/users/{id}/ban',
    id: 'setUserBan',
    body: UserBanInputSchema,
    response: UserSchema,
  },
  {
    method: 'patch',
    path: '/api/admin/reports/{id}',
    id: 'reviewReport',
    body: ReportReviewInputSchema,
    response: OkSchema,
  },
  {
    method: 'post',
    path: '/api/support/conversations',
    id: 'startSupportConversation',
    body: SupportInputSchema,
    response: ConversationSchema,
  },
  {
    method: 'get',
    path: '/api/admin/support',
    id: 'listSupportThreads',
    response: z.array(SupportThreadSchema),
  },
  {
    method: 'patch',
    path: '/api/admin/support/{id}',
    id: 'setSupportStatus',
    body: SupportStatusInputSchema,
    response: SupportThreadSchema,
  },
  { method: 'get', path: '/api/users/{id}', id: 'getPublicProfile', response: PublicProfileSchema },
  {
    method: 'patch',
    path: '/api/profile',
    id: 'updateProfile',
    body: UpdateProfileInputSchema,
    response: PublicProfileSchema,
  },
  {
    method: 'post',
    path: '/api/profile/avatar/uploads',
    id: 'requestProfileAvatarUpload',
    body: AvatarUploadInputSchema,
    response: MediaUploadPlanSchema,
  },
  {
    method: 'delete',
    path: '/api/profile/avatar/uploads/{id}',
    id: 'deleteProfileAvatarUpload',
    response: OkSchema,
  },
  {
    method: 'post',
    path: '/api/profile/avatar/uploads/{id}/complete',
    id: 'completeProfileAvatarUpload',
    response: PublicProfileSchema,
  },
  { method: 'delete', path: '/api/profile/avatar', id: 'deleteProfileAvatar', response: PublicProfileSchema },
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
    path: '/api/auth/test-token',
    id: 'issueTestToken',
    body: TestLoginInputSchema,
    response: TestTokenSchema,
  },
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
    method: 'delete',
    path: '/api/conversations/{id}/messages',
    id: 'clearChatHistory',
    body: ClearChatHistoryInputSchema,
    response: OkSchema,
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
    path: '/api/conversations/{id}/attachments/uploads',
    id: 'requestChatAttachmentUpload',
    body: MediaUploadInputSchema,
    response: MediaUploadPlanSchema,
  },
  {
    method: 'post',
    path: '/api/conversations/{id}/attachments/{attachmentId}/complete',
    id: 'completeChatAttachmentUpload',
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
  {
    method: 'get',
    path: '/api/admin/reports',
    id: 'listReports',
    response: AdminReportListSchema,
    query: true,
  },
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
    path: '/api/posts/{id}/views',
    id: 'recordPostView',
    body: PostViewInputSchema,
    response: PostViewSchema,
  },
  {
    method: 'get',
    path: '/api/posts/{id}/comments',
    id: 'listPostComments',
    response: CommentPageSchema,
    query: true,
  },
  {
    method: 'post',
    path: '/api/posts/{id}/comments',
    id: 'createComment',
    body: CreateCommentInputSchema,
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
  {
    method: 'post',
    path: '/api/push/devices/register',
    id: 'registerPushDevice',
    body: RegisterPushDeviceSchema,
    response: PushDeviceStatusSchema,
  },
  {
    method: 'post',
    path: '/api/push/devices/unregister',
    id: 'unregisterPushDevice',
    body: UnregisterPushDeviceSchema,
    response: OkSchema,
  },
  { method: 'post', path: '/api/reports', id: 'createReport', body: ReportInputSchema, response: OkSchema },
  { method: 'get', path: '/api/blocks', id: 'listBlocks', response: z.array(AuthorSchema) },
  { method: 'get', path: '/api/users/{id}/follow', id: 'getUserFollow', response: FollowStatusSchema },
  {
    method: 'put',
    path: '/api/users/{id}/follow',
    id: 'followUser',
    body: FollowInputSchema,
    response: FollowStatusSchema,
  },
  { method: 'delete', path: '/api/users/{id}/follow', id: 'unfollowUser', response: OkSchema },
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
export { AuthReturnPathSchema } from './auth-return-path';
