function Field({ field }: { field: { value: string; onChange: (value: string) => void } }) {
  return <input value={field.value} onChange={field.onChange} />;
}
