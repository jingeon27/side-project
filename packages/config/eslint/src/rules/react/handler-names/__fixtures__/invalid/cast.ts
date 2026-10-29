function useEscape() {
  const escape = (event: KeyboardEvent) => {
    event.preventDefault();
    close();
  };
  window.addEventListener('keydown', escape as EventListener);
}
