// Banned users keep their session, logout, account deletion and the administrator support chat.
// Conversation access is narrowed again by ChatAccessService.visible to support conversations only.
const supportChatWrite =
  /^\/api\/conversations\/[^/]+\/(?:(?:messages|read|attachments)(?:\/[^/]+)?|attachments\/[^/]+\/complete)$/;

export function bannedUserMayWrite(method: string, path: string) {
  return (
    path === '/api/support/conversations' ||
    path === '/api/auth/logout' ||
    (method === 'DELETE' && path === '/api/me') ||
    supportChatWrite.test(path)
  );
}
