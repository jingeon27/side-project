function Component() {
  return <button onClick={() => globalThis.fetch('/upload')}>올리기</button>;
}
