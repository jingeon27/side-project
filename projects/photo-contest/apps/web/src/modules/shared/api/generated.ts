import type { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  /** ISO 8601 시각 문자열 */
  DateTime: { input: string; output: string; }
};

export const GroupRole = {
  Member: 'MEMBER',
  Owner: 'OWNER'
} as const;

export type GroupRole = typeof GroupRole[keyof typeof GroupRole];
export const Phase = {
  Completed: 'COMPLETED',
  Submission: 'SUBMISSION',
  Upcoming: 'UPCOMING',
  Voting: 'VOTING'
} as const;

export type Phase = typeof Phase[keyof typeof Phase];
export const SubmissionSort = {
  /** 좋아요순, 같으면 최신순 */
  MostLiked: 'MOST_LIKED',
  /** 최신순 */
  Newest: 'NEWEST',
  /** 오래된순 */
  Oldest: 'OLDEST'
} as const;

export type SubmissionSort = typeof SubmissionSort[keyof typeof SubmissionSort];
export type MeQueryVariables = Exact<{ [key: string]: never; }>;


export type MeQuery = { me: { __typename: 'User', id: string, nickname: string, avatar: string | null } | null };


export const MeDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Me"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"me"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"nickname"}},{"kind":"Field","name":{"kind":"Name","value":"avatar"}}]}}]}}]} as unknown as DocumentNode<MeQuery, MeQueryVariables>;