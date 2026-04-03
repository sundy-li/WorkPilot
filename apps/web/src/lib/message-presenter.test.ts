import { describe, expect, test } from "bun:test";
import type { AgentIdentity, MessageDTO } from "@workpilot/shared";
import { resolveMessageSenderDisplayName } from "./message-presenter";

const agents: AgentIdentity[] = [
  {
    id: "agt_coding",
    runtimeId: "rtm_local",
    channelId: "dir_coding",
    name: "Coding",
    description: "Code assistant",
    implementation: "codex",
    model: "gpt-5.4",
    reasoningEffort: "high",
    status: "running"
  }
];

describe("message presenter", () => {
  test("shows the signed-in account name for own messages", () => {
    const message = {
      senderId: "usr_admin",
      senderType: "user"
    } satisfies Pick<MessageDTO, "senderId" | "senderType">;

    expect(
      resolveMessageSenderDisplayName({
        message,
        agents,
        sessionUserId: "usr_admin",
        accountName: "sundy"
      })
    ).toBe("sundy");
  });

  test("resolves agent ids into agent names", () => {
    const message = {
      senderId: "agt_coding",
      senderType: "agent"
    } satisfies Pick<MessageDTO, "senderId" | "senderType">;

    expect(
      resolveMessageSenderDisplayName({
        message,
        agents,
        sessionUserId: "usr_admin",
        accountName: "sundy"
      })
    ).toBe("Coding");
  });

  test("falls back to sender id when no display name is available", () => {
    const message = {
      senderId: "usr_member",
      senderType: "user"
    } satisfies Pick<MessageDTO, "senderId" | "senderType">;

    expect(
      resolveMessageSenderDisplayName({
        message,
        agents,
        sessionUserId: "usr_admin",
        accountName: "sundy"
      })
    ).toBe("usr_member");
  });
});
