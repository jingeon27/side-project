function Dialog({ onClose }: { onClose: () => void }) {
  return <button onClick={onClose}>닫기</button>;
}

function Sheet(props: { onSave: () => void }) {
  return <button onClick={props.onSave}>저장</button>;
}
