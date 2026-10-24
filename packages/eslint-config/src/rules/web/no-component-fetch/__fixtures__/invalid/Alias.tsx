function Component() {
  const request = fetch;
  const { fetch: send } = window;
  return <button onClick={() => request('/upload').then(() => send('/done'))}>올리기</button>;
}
