import type { AgentIdentity, IssueDTO, MessageDTO, RuntimeIdentity } from "@workpilot/shared";

export type RailActivityState = "idle" | "typing" | "running" | "reviewing";
export type RailStepState = "done" | "running" | "pending";

export interface RailStep {
  title: string;
  detail: string;
  state: RailStepState;
}

export interface RailMetric {
  label: string;
  value: string;
}

export interface InspectionRailModel {
  heroLabel: string;
  title: string;
  subtitle: string;
  activityState: RailActivityState;
  activityLabel: string;
  steps: RailStep[];
  metrics: RailMetric[];
}

interface CreateInspectionRailModelInput {
  kind: "message" | "issue" | "agent" | "runtime" | "account";
  message?: MessageDTO | null;
  issue?: IssueDTO | null;
  agent?: AgentIdentity | null;
  runtime?: RuntimeIdentity | null;
  issues?: IssueDTO[];
  messages?: MessageDTO[];
}

export function createInspectionRailModel(input: CreateInspectionRailModelInput): InspectionRailModel {
  switch (input.kind) {
    case "agent":
      return createAgentRail(input);
    case "issue":
      return createIssueRail(input);
    case "message":
      return createMessageRail(input);
    case "runtime":
      return createRuntimeRail(input);
    default:
      return {
        heroLabel: "Workspace",
        title: "Account",
        subtitle: "Profile and access controls.",
        activityState: "idle",
        activityLabel: "Idle",
        steps: [],
        metrics: []
      };
  }
}

function createAgentRail(input: CreateInspectionRailModelInput): InspectionRailModel {
  const agent = input.agent;
  const assignedIssues = (input.issues ?? []).filter((issue) => issue.assigneeId === agent?.id);
  const recentMessages = (input.messages ?? []).filter((message) => message.senderId === agent?.id);
  const activityState: RailActivityState = assignedIssues.some((issue) => issue.status === "in_progress" || issue.status === "in_review")
    ? "running"
    : recentMessages.length > 0
      ? "typing"
      : "idle";

  return {
    heroLabel: "Agent live",
    title: agent?.name ?? "Agent",
    subtitle: activityState === "running" ? "Executing delegated work across the channel." : "Ready for new instructions.",
    activityState,
    activityLabel: formatActivityLabel(activityState),
    steps: [
      {
        title: "Context synchronized",
        detail: "Latest channel history and linked issues loaded.",
        state: "done"
      },
      {
        title: "Reasoning over current work",
        detail: assignedIssues.length > 0 ? `${assignedIssues.length} assigned issue(s) under review.` : "Waiting for the next issue batch.",
        state: activityState === "running" ? "running" : "pending"
      },
      {
        title: "Publishing next update",
        detail: "The next summary, issue event, or reply will land back in this channel.",
        state: activityState === "idle" ? "pending" : "running"
      }
    ],
    metrics: [
      { label: "Runtime", value: input.runtime?.name ?? agent?.runtimeId ?? "Unknown" },
      { label: "Assigned issues", value: String(assignedIssues.length) },
      { label: "Recent messages", value: String(recentMessages.length) }
    ]
  };
}

function createIssueRail(input: CreateInspectionRailModelInput): InspectionRailModel {
  const issue = input.issue;
  const activityState: RailActivityState =
    issue?.status === "in_progress" ? "running" : issue?.status === "in_review" ? "reviewing" : "idle";

  return {
    heroLabel: "Execution",
    title: issue?.title ?? "Issue",
    subtitle: "Issue lifecycle, assignee focus, and execution handoff.",
    activityState,
    activityLabel: formatActivityLabel(activityState),
    steps: [
      {
        title: "Issue created",
        detail: issue?.sourceChannelId ? "Created from the current channel context." : "Created as a global board issue.",
        state: "done"
      },
      {
        title: "Agent claimed work",
        detail: issue?.assigneeId ? `Assigned to ${input.agent?.name ?? issue.assigneeId}.` : "No assignee yet.",
        state: issue?.assigneeId ? "done" : "pending"
      },
      {
        title: "Execution in progress",
        detail: issue?.status === "in_progress" ? "The assignee is actively working through the issue." : "Waiting for an active run state.",
        state: issue?.status === "in_progress" ? "running" : "pending"
      },
      {
        title: "Result return",
        detail: "Completion output will be pushed back into the message stream.",
        state: issue?.status === "done" ? "done" : "pending"
      }
    ],
    metrics: [
      { label: "Status", value: formatIssueStatus(issue?.status) },
      { label: "Assignee", value: input.agent?.name ?? issue?.assigneeId ?? "Unassigned" },
      { label: "Scope", value: issue?.sourceChannelId ? "Channel-linked" : "Global" }
    ]
  };
}

function formatIssueStatus(status?: IssueDTO["status"] | null) {
  switch (status) {
    case "backlog":
      return "Backlog";
    case "todo":
      return "Todo";
    case "in_progress":
      return "In Progress";
    case "in_review":
      return "In Review";
    case "done":
      return "Done";
    default:
      return "unknown";
  }
}

function createMessageRail(input: CreateInspectionRailModelInput): InspectionRailModel {
  const message = input.message;
  const activityState: RailActivityState = message?.senderType === "agent" ? "typing" : "reviewing";

  return {
    heroLabel: "Thread inspection",
    title: message?.senderId ?? "Message",
    subtitle: "Trace the message, the derived work, and the next likely action.",
    activityState,
    activityLabel: formatActivityLabel(activityState),
    steps: [
      {
        title: "Message captured",
        detail: "The rail is pinned to the selected conversation event.",
        state: "done"
      },
      {
        title: "Issue linkage",
        detail: input.issue ? "A downstream issue is already linked to this message." : "This message has not been promoted to an issue yet.",
        state: input.issue ? "done" : "pending"
      },
      {
        title: "Agent follow-up",
        detail: message?.senderType === "agent" ? "The Agent is still elaborating or preparing the next update." : "Reviewing message context for the next action.",
        state: "running"
      }
    ],
    metrics: [
      { label: "Sender", value: message?.senderId ?? "Unknown" },
      { label: "Type", value: message?.senderType ?? "unknown" },
      { label: "Linked issue", value: input.issue?.title ?? "None" }
    ]
  };
}

function createRuntimeRail(input: CreateInspectionRailModelInput): InspectionRailModel {
  const runtime = input.runtime;
  const activityState: RailActivityState = runtime?.status === "online" ? "running" : "idle";

  return {
    heroLabel: "Runtime host",
    title: runtime?.name ?? "Runtime",
    subtitle: "Host health, registration, and downstream Agent capacity.",
    activityState,
    activityLabel: formatActivityLabel(activityState),
    steps: [
      {
        title: "Runtime registered",
        detail: "The daemon is attached to the organization control plane.",
        state: "done"
      },
      {
        title: "Heartbeat stream",
        detail: runtime?.status === "online" ? "Heartbeat checks are arriving normally." : "Waiting for the daemon to report back.",
        state: runtime?.status === "online" ? "running" : "pending"
      },
      {
        title: "Agent container ready",
        detail: "Create and supervise multiple Agents under this runtime host.",
        state: "pending"
      }
    ],
    metrics: [
      { label: "Status", value: runtime?.status ?? "unknown" },
      { label: "Runtime ID", value: runtime?.id ?? "Unknown" }
    ]
  };
}

function formatActivityLabel(state: RailActivityState) {
  switch (state) {
    case "typing":
      return "Typing";
    case "running":
      return "Running";
    case "reviewing":
      return "Reviewing";
    default:
      return "Idle";
  }
}
