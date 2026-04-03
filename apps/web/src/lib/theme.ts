import type { IssueDTO, MessageDTO, RuntimeIdentity } from "@workpilot/shared";

export type StatusTone = "neutral" | "success" | "warning" | "danger";
export type ActorTone = "human" | "agent" | "system";
export type SidebarItemKind = "channel" | "agent";
export type TimelineStepState = "pending" | "running" | "done";

export function getActorTone(senderType: MessageDTO["senderType"]): ActorTone {
  switch (senderType) {
    case "agent":
      return "agent";
    case "system":
      return "system";
    default:
      return "human";
  }
}

export function getRuntimeStatusTone(status: RuntimeIdentity["status"]): StatusTone {
  switch (status) {
    case "online":
      return "success";
    case "offline":
    case "unhealthy":
      return "warning";
    case "revoked":
      return "danger";
    default:
      return "neutral";
  }
}

export function getIssueStatusTone(status: IssueDTO["status"]): StatusTone {
  switch (status) {
    case "done":
      return "success";
    case "in_progress":
    case "in_review":
      return "warning";
    case "backlog":
      return "neutral";
    default:
      return "neutral";
  }
}

export function getMessageSurfaceClass(tone: ActorTone, isSelected: boolean) {
  return [
    "message-surface",
    "message-surface--frame-on-hover",
    `message-surface--${tone}`,
    isSelected ? "message-surface--selected" : "message-surface--idle"
  ].join(" ");
}

export function getSidebarItemClass(kind: SidebarItemKind, isActive: boolean) {
  return ["sidebar-item", `sidebar-item--${kind}`, isActive ? "sidebar-item--active" : "sidebar-item--idle"].join(" ");
}

export function getActorAvatarClass(tone: ActorTone) {
  return ["actor-avatar", `actor-avatar--${tone}`].join(" ");
}

export function getDetailCardClass(accent: StatusTone | "agent") {
  return ["detail-card", `detail-card--${accent}`].join(" ");
}

export function getStatusPillClass(tone: StatusTone) {
  return ["status-pill", `status-pill--${tone}`].join(" ");
}

export function getStatusDotClass(tone: StatusTone) {
  return ["status-dot", `status-dot--${tone}`].join(" ");
}

export function getInspectionHeroClass(tone: StatusTone) {
  return ["inspection-hero", `inspection-hero--${tone}`].join(" ");
}

export function getActivitySignalClass(tone: StatusTone) {
  return ["agent-signal", `agent-signal--${tone}`].join(" ");
}

export function getTimelineStepCardClass(state: TimelineStepState) {
  return ["timeline-step", `timeline-step--${state}`].join(" ");
}

export function getTimelineDotClass(state: TimelineStepState) {
  return ["timeline-dot", `timeline-dot--${state}`].join(" ");
}

export function getTimelineConnectorClass(state: TimelineStepState) {
  return ["timeline-connector", state === "pending" ? "timeline-connector--pending" : "timeline-connector--active"].join(" ");
}
