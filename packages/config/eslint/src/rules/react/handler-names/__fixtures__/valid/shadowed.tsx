const submit = () => save();
function Search({ submit }: { submit: () => void }) {
  return <form onSubmit={submit} />;
}
function Results() {
  const { notify } = useSource();
  document.addEventListener('visibilitychange', notify);
  return null;
}
