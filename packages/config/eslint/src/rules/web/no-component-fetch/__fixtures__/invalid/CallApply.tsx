function Component() {
  const upload = () => fetch.call(window, '/upload');
  const retry = () => window.fetch.apply(window, ['/upload']);
  return <button onClick={() => upload().catch(retry)}>올리기</button>;
}
