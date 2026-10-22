function Form({ save }: { save: () => void }) {
  const handleSubmit = () => save();
  return (
    <form onSubmit={handleSubmit}>
      <button onClick={handleSubmit}>저장</button>
    </form>
  );
}
