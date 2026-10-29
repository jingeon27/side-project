function requestLogout() {
  return api.logout();
}
function Settings() {
  const label = () => '로그아웃';
  return (
    <button onClick={requestLogout} onFocus={() => reportFocus()}>
      {label()}
    </button>
  );
}
