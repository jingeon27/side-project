export async function initialDocumentData<T>(
  data: Promise<T>,
  blocking: boolean,
): Promise<{ value: T | Promise<T> }> {
  if (!blocking) return { value: data };
  try {
    return { value: await data };
  } catch {
    return { value: data };
  }
}
