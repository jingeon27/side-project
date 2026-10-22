export class StorageUploadError extends Error {}

export async function uploadToStorage(
  ticket: { url: string; fields: ReadonlyArray<{ name: string; value: string }> },
  file: Blob,
) {
  const body = new FormData();
  for (const field of ticket.fields) body.append(field.name, field.value);
  // S3 POST는 file 필드가 마지막이어야 하며 multipart 경계는 브라우저가 만든다.
  body.append('file', file);
  try {
    const response = await fetch(ticket.url, { method: 'POST', credentials: 'omit', body });
    if (!response.ok) throw new Error('Storage rejected upload');
  } catch {
    throw new StorageUploadError('파일을 올리지 못했어요. 연결을 확인하고 다시 시도해 주세요.');
  }
}
