import { describe, expect, test } from "bun:test";
import type { AgentIdentity, IssueDTO, MessageDTO, RuntimeIdentity } from "@workpilot/shared";
import { createInspectionRailModel } from "./inspection-rail";

const runtime: RuntimeIdentity = {
  id: "rtm_demo",
  name: "datacenter",
  status: "online"
};

const agent: AgentIdentity = {
  id: "agt_release",
  runtimeId: runtime.id,
  channelId: "dir_release",
  name: "Release Analyst",
  description: "Tracks release quality and summarizes regressions.",
  implementation: "codex",
  model: "gpt-5.4",
  reasoningEffort: "medium",
  status: "running"
};

const message: MessageDTO = {
  id: "msg_demo",
  channelId: "chn_general",
  content: "Please check the latest rollout risks.",
  attachments: [],
  senderId: agent.id,
  senderType: "agent",
  createdAt: "2025-01-10T10:00:00.000Z"
};

const issue: IssueDTO = {
  id: "iss_demo",
  title: "Review rollout risks",
  description: "Use the selected conversation as context and summarize rollout blockers.",
  status: "in_progress",
  assigneeId: agent.id,
  creatorId: "usr_admin",
  priority: "medium",
  dueDate: null,
  project: null,
  sourceChannelId: "chn_general",
  createdAt: "2025-01-10T10:02:00.000Z",
  updatedAt: "2025-01-10T10:02:00.000Z"
};

describe("inspection rail", () => {
  test("shows a live agent rail with active steps when an agent is selected", () => {
    const model = createInspectionRailModel({
      kind: "agent",
      agent,
      runtime,
      issues: [issue],
      messages: [message]
    });

    expect(model.activityState).toBe("running");
    expect(model.heroLabel).toBe("Agent live");
    expect(model.steps.some((step) => step.state === "running")).toBe(true);
    expect(model.metrics.find((metric) => metric.label === "Assigned issues")?.value).toBe("1");
  });

  test("builds an execution timeline for a running issue", () => {
    const model = createInspectionRailModel({
      kind: "issue",
      issue,
      agent,
      runtime
    });

    expect(model.activityState).toBe("running");
    expect(model.heroLabel).toBe("Execution");
    expect(model.steps.map((step) => step.state)).toContain("running");
    expect(model.metrics.find((metric) => metric.label === "Assignee")?.value).toContain(agent.name);
  });

  test("treats agent-authored messages as active analysis in the rail", () => {
    const model = createInspectionRailModel({
      kind: "message",
      message,
      issue,
      agent
    });

    expect(model.activityState).toBe("typing");
    expect(model.heroLabel).toBe("Thread inspection");
    expect(model.steps[0]?.state).toBe("done");
    expect(model.steps.some((step) => step.state === "running")).toBe(true);
  });
});
