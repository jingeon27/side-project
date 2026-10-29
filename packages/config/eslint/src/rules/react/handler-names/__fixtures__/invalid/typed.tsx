function Search() {
  const submit: (event: MouseEvent) => void = (event) => {
    event.preventDefault();
    save();
  };
  return <button onClick={submit}>저장</button>;
}
