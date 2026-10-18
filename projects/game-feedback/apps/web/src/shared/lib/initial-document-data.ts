export async function initialDocumentData<T>(
  data: Promise<T>,
  blocking: boolean,
): Promise<{ value: T | Promise<T> }> {
  if (!blocking) return { value: data };
  return data.then(
    (value) => ({ value }),
    () => ({ value: data }),
  );
}
