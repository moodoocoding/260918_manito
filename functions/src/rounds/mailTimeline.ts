export type Conversation = "caredFor" | "carer" | "unknown";
export type MailCopy = {
  messageId: string;
  direction: "inbox" | "sent";
  replyToMessageId: string | null;
  createdAtMillis: number;
};

// A conversation follows its first note. This keeps the two roles separate even
// when the same pair of students happened to be matched in both directions.
export function classifyMail(copies: MailCopy[]): Map<string, {conversation: Conversation; sequence: number}> {
  const byId = new Map(copies.map((copy) => [copy.messageId, copy]));
  const resolved = new Map<string, Conversation>();
  function conversationOf(messageId: string, visiting = new Set<string>()): Conversation {
    const known = resolved.get(messageId);
    if (known) return known;
    const copy = byId.get(messageId);
    if (!copy || visiting.has(messageId)) return "unknown";
    visiting.add(messageId);
    const result = copy.replyToMessageId
      ? conversationOf(copy.replyToMessageId, visiting)
      : copy.direction === "sent" ? "caredFor" : "carer";
    visiting.delete(messageId);
    resolved.set(messageId, result);
    return result;
  }
  const ordered = [...copies].sort((a, b) => a.createdAtMillis - b.createdAtMillis
    || a.messageId.localeCompare(b.messageId));
  return new Map(ordered.map((copy, sequence) => [copy.messageId,
    {conversation: conversationOf(copy.messageId), sequence}]));
}
