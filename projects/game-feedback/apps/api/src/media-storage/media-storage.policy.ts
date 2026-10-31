import dayjs from 'dayjs';

/** Lifetime of a presigned upload form. S3 refuses a POST that starts after it. */
export const MEDIA_UPLOAD_TTL_SECONDS = 300;
/**
 * Completion stays open this long after the form expires: a 25MB file started just before expiry can
 * still be in flight on a slow link. Completion re-checks the object (HEAD size/type/ETag, signature
 * bytes, ETag-conditioned copy), so the window only affects whether a finished upload is accepted.
 */
export const MEDIA_COMPLETE_GRACE_SECONDS = 1800;
export const MEDIA_READ_TTL_SECONDS = 60;

/** When the presigned form for a reservation made at `reservedAt` expires. */
export function presignExpiry(reservedAt: Date) {
  return dayjs(reservedAt).add(MEDIA_UPLOAD_TTL_SECONDS, 'second').toDate();
}
/** The last moment an upload whose form expires at `formExpiresAt` may be completed. */
export function completionDeadline(formExpiresAt: Date) {
  return dayjs(formExpiresAt).add(MEDIA_COMPLETE_GRACE_SECONDS, 'second').toDate();
}
