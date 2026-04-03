import type { MessageDTO } from "@workpilot/shared";

export function getMessageAttachments(attachments: unknown): MessageDTO["attachments"] {
  return Array.isArray(attachments) ? (attachments as MessageDTO["attachments"]) : [];
}
