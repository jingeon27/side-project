// 1:1 대화는 두 사용자 ID를 문자열 순서로 정렬한 (firstUserId, secondUserId) 하나로 저장한다.
export function conversationPair(userId: string, otherUserId: string) {
  return userId < otherUserId
    ? { firstUserId: userId, secondUserId: otherUserId }
    : { firstUserId: otherUserId, secondUserId: userId };
}
