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
    "message-surface--idle"
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

export interface StatusLaneConfig {
  id: IssueDTO["status"];
  label: string;
  helper: string;
  icon: string;
  color: string;
  colorLight: string;
  laneBg: string;
  badgeBg: string;
  badgeText: string;
  cardBorder: string;
  dotGlow: string;
}

const STATUS_LANE_CONFIGS: Record<IssueDTO["status"], StatusLaneConfig> = {
  backlog: {
    id: "backlog",
    label: "Backlog",
    helper: "Ready for product grooming",
    icon: "CircleDot",
    color: "#94a3b8",
    colorLight: "#cbd5e1",
    laneBg: "#f8fafc",
    badgeBg: "#f1f5f9",
    badgeText: "#475569",
    cardBorder: "rgba(148,163,184,0.12)",
    dotGlow: "rgba(148,163,184,0.15)",
  },
  todo: {
    id: "todo",
    label: "Todo",
    helper: "Ready for iteration planning",
    icon: "Circle",
    color: "#6366f1",
    colorLight: "#a5b4fc",
    laneBg: "#eef2ff",
    badgeBg: "#e0e7ff",
    badgeText: "#4338ca",
    cardBorder: "rgba(99,102,241,0.12)",
    dotGlow: "rgba(99,102,241,0.15)",
  },
  in_progress: {
    id: "in_progress",
    label: "In Progress",
    helper: "Active development only",
    icon: "Loader",
    color: "#f59e0b",
    colorLight: "#fcd34d",
    laneBg: "#fffbeb",
    badgeBg: "#fef3c7",
    badgeText: "#92400e",
    cardBorder: "rgba(245,158,11,0.12)",
    dotGlow: "rgba(245,158,11,0.15)",
  },
  in_review: {
    id: "in_review",
    label: "In Review",
    helper: "Review, test, and acceptance",
    icon: "Eye",
    color: "#a78bfa",
    colorLight: "#c4b5fd",
    laneBg: "#f5f3ff",
    badgeBg: "#ede9fe",
    badgeText: "#6d28d9",
    cardBorder: "rgba(167,139,250,0.12)",
    dotGlow: "rgba(167,139,250,0.15)",
  },
  done: {
    id: "done",
    label: "Done",
    helper: "Merged, deployed, accepted",
    icon: "Check",
    color: "#10b981",
    colorLight: "#6ee7b7",
    laneBg: "#ecfdf5",
    badgeBg: "#d1fae5",
    badgeText: "#047857",
    cardBorder: "rgba(16,185,129,0.12)",
    dotGlow: "rgba(16,185,129,0.15)",
  },
};

const LANE_ORDER: IssueDTO["status"][] = ["backlog", "todo", "in_progress", "in_review", "done"];

export function getStatusLaneConfigs(): StatusLaneConfig[] {
  return LANE_ORDER.map((id) => STATUS_LANE_CONFIGS[id]);
}

export function getStatusLaneConfig(status: IssueDTO["status"]): StatusLaneConfig {
  return STATUS_LANE_CONFIGS[status];
}

export type PriorityTone = { bg: string; text: string };

const PRIORITY_COLORS: Record<IssueDTO["priority"], PriorityTone> = {
  high: { bg: "#fef2f2", text: "#dc2626" },
  medium: { bg: "#fefce8", text: "#a16207" },
  low: { bg: "#f0fdf4", text: "#15803d" },
};

export function getPriorityColor(priority: IssueDTO["priority"]): PriorityTone {
  return PRIORITY_COLORS[priority];
}
