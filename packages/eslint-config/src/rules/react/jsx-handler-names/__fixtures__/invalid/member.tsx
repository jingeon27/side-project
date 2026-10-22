function LoginPrompt({ auth }: { auth: { login: () => void } }) {
  return <button onClick={auth.login}>로그인</button>;
}
