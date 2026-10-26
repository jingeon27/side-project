function Component({ fetch }: { fetch: () => void }) {
  return <button onClick={() => fetch()}>다시 불러오기</button>;
}

function Refresh() {
  const { refetch: fetch } = useQuery();
  return <button onClick={() => fetch()}>새로고침</button>;
}
