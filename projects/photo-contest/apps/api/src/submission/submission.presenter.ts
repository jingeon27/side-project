import type { Prisma } from '../../generated/prisma';
import { USER_VIEW_SELECT } from '../auth/user-view';
import type { IUserView } from '../auth/user-view';

export interface IReportView {
  id: string;
  reason: string;
  createdAt: Date;
}

/** GraphQL Submission */
export interface ISubmissionView {
  id: string;
  contestId: string;
  author: IUserView;
  caption: string;
  imageUrl: string;
  hidden: boolean;
  createdAt: Date;
  /** 대회가 끝난 뒤에만 공개 */
  voteCount: number | null;
  likeCount: number;
  likedByMe: boolean;
  /** 관리자에게만 공개 */
  reportCount: number | null;
  reports: IReportView[] | null;
}

export interface IPresentOptions {
  completed: boolean;
  admin: boolean;
}

/**
 * 좋아요 수·내 좋아요 여부·득표수를 목록 쿼리 한 번으로 함께 읽는다(사진마다 따로 조회하지 않는다).
 * 신고 내용은 관리자일 때만 읽는다.
 */
export function submissionInclude(viewerId: string, admin: boolean) {
  return {
    author: { select: USER_VIEW_SELECT },
    likes: { where: { userId: viewerId }, select: { userId: true } },
    reports: {
      select: { id: true, reason: true, createdAt: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: admin ? undefined : 0,
    },
    _count: { select: { votes: true, likes: true, reports: true } },
  } satisfies Prisma.SubmissionInclude;
}

export type TSubmissionRow = Prisma.SubmissionGetPayload<{ include: ReturnType<typeof submissionInclude> }>;

/** 웹 origin의 /backend 프록시 경로. 사진은 요청마다 멤버십을 다시 확인한다. */
export function photoUrl(submissionId: string) {
  return `/backend/photos/${submissionId}`;
}

export function presentSubmission(
  row: TSubmissionRow,
  { completed, admin }: IPresentOptions,
): ISubmissionView {
  return {
    id: row.id,
    contestId: row.contestId,
    author: row.author,
    caption: row.caption,
    imageUrl: photoUrl(row.id),
    hidden: row.hidden,
    createdAt: row.createdAt,
    voteCount: completed ? row._count.votes : null,
    likeCount: row._count.likes,
    likedByMe: row.likes.length > 0,
    reportCount: admin ? row._count.reports : null,
    reports: admin ? row.reports : null,
  };
}
