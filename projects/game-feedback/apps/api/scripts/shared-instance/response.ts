import assert from 'node:assert/strict';

import type { Conversation, TMediaUploadPlan, TPostMedia } from '@game-feedback/contracts';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readObject(value: unknown) {
  assert.ok(isObject(value), 'Expected a JSON object');
  return value;
}

function readString(value: unknown) {
  assert.ok(typeof value === 'string', 'Expected a string');
  return value;
}

function readNumber(value: unknown) {
  assert.ok(typeof value === 'number', 'Expected a number');
  assert.ok(Number.isFinite(value), 'Expected a finite number');
  return value;
}

function readArray(value: unknown): unknown[] {
  assert.ok(Array.isArray(value), 'Expected an array');
  return value;
}

export function parseJson<T>(text: string, decode: (value: unknown) => T) {
  const value: unknown = JSON.parse(text);
  return decode(value);
}

function graphQlField(value: unknown, name: string) {
  return readObject(readObject(readObject(value).data)[name]);
}

export function groupResponse(value: unknown) {
  return { id: readString(graphQlField(value, 'createGroup').id) };
}

export function postUploadResponse(value: unknown) {
  const upload = graphQlField(value, 'requestPostUpload');
  return {
    id: readString(upload.id),
    url: readString(upload.url),
    fields: readArray(upload.fields).map((entry) => {
      const field = readObject(entry);
      return { name: readString(field.name), value: readString(field.value) };
    }),
  };
}

export function completedUploadResponse(value: unknown) {
  const upload = graphQlField(value, 'completePostUpload');
  return { id: readString(upload.id), byteSize: readNumber(upload.byteSize) };
}

export function postResponse(value: unknown) {
  const post = graphQlField(value, 'createPost');
  return { id: readString(post.id), mediaUrl: readString(post.mediaUrl) };
}

export function mediaPlanResponse(value: unknown) {
  const upload = readObject(value);
  return {
    id: readString(upload.id),
    url: readString(upload.url),
    expiresAt: readString(upload.expiresAt),
    fields: Object.fromEntries(
      Object.entries(readObject(upload.fields)).map(([name, entry]) => [name, readString(entry)] as const),
    ),
  } satisfies TMediaUploadPlan;
}

export function mediaResponse(value: unknown) {
  const media = readObject(value);
  return { id: readString(media.id), url: readString(media.url) } satisfies Pick<TPostMedia, 'id' | 'url'>;
}

export function conversationResponse(value: unknown) {
  return { id: readString(readObject(value).id) } satisfies Pick<Conversation, 'id'>;
}

export function invalidationResponse(value: unknown) {
  const event = readObject(value);
  return { conversationId: event.conversationId === null ? null : readString(event.conversationId) };
}

export function storageResponse(value: unknown) {
  const response = readObject(value);
  return { status: readNumber(response.status), body: readString(response.body) };
}

export function signedContentResponse(value: unknown) {
  const response = readObject(value);
  return {
    status: readNumber(response.status),
    cache: response.cache === null ? null : readString(response.cache),
    bytes: readString(response.bytes),
  };
}

export function adminResponse(value: unknown) {
  const account = readObject(value);
  return { username: readString(account.username), userId: readString(account.userId) };
}
