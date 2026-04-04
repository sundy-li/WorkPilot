import type { AuthSession, ChannelSummary, IssueDTO, MessageDTO, WorkspaceBootstrapPayload } from "@workpilot/shared";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from "@workpilot/ui";
import {
  Bot,
  ChevronDown,
  ChevronRight,
  Copy,
  FileText,
  ClipboardList,
  KanbanSquare,
  CalendarDays,
  LogOut,
  MessageSquareText,
  Monitor,
  PanelRightClose,
  Plus,
  RotateCcw,
  Settings,
  Square,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
  GitBranch,
  UserRound,
  GripVertical
} from "lucide-react";
import { startTransition, useEffect, useMemo, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { createWorkPilotApiClient } from "./lib/api";
import { parseRouterState, usePathname, useNavigate, buildPath } from "./lib/router";
import {
  createAgentDraftForImplementation,
  createInitialAgentDraft,
  getAgentImplementationDefinition,
  listAgentImplementationDefinitions,
  type AgentDraft
} from "./lib/agent-catalog";
import { getPublicImplementationSummary } from "./lib/agent-presentation";
import { avatarGlyphIds, avatarPalettes, getAvatarGlyph, getAvatarInitials, getAvatarPalette, getAvatarPaletteById, type AvatarGlyphId } from "./lib/avatar";
import { shouldAutoScrollToLatest } from "./lib/chat-scroll";
import { mergeChannelMessages, shouldPollCurrentChat } from "./lib/chat-sync";
import { formatConversationTitle } from "./lib/chat-header";
import {
  createComposerAttachmentDrafts,
  createComposerAttachmentDraftsFromFileList,
  type ComposerAttachmentDraft
} from "./lib/composer-attachments";
import { resolveConversationChannelId } from "./lib/conversation-channel";
import { shouldSendMessageFromKeypress, shouldSubmitInlineDraftFromKeypress } from "./lib/composer";
import {
  createInspectionRailModel,
  type InspectionRailModel,
  type RailActivityState,
  type RailMetric,
  type RailStep
} from "./lib/inspection-rail";
import { getAgentActivityBadge } from "./lib/agent-activity";
import { getAgentWorkspaceLayoutClasses, getAppShellGridClass, getChatPanelLayoutClasses } from "./lib/app-shell-layout";
import { closeDetailPanel, openDetailPanel, shouldShowExplorer, type DetailPanelState } from "./lib/layout-state";
import { clearSelection, createSelectionState, toggleMessageSelection, type MessageSelectionState } from "./lib/message-selection";
import { getMessageAttachments } from "./lib/message-attachments";
import { resolveMessageSenderDisplayName } from "./lib/message-presenter";
import {
  buildRuntimeInstallCommand,
  createRuntimeConnectPanel,
  findNewlyConnectedRuntime,
  getRuntimeConnectStatusText
} from "./lib/runtime-connect";
import { createTimestampLabels } from "./lib/timestamp";
import {
  createInitialShellState,
  getChannelDisplayName,
  getDefaultChannelId,
  selectConversationTarget,
  selectPrimaryView,
  selectWorkspace,
  type ShellState
} from "./lib/shell-state";
import { openAgentCreationFromSidebar } from "./lib/sidebar-actions";
import {
  createInitialAgentWorkspaceBrowserState,
  createInitialRuntimeWorkspaceBrowserState,
  selectAgentWorkspaceTarget,
  selectRuntimeWorkspaceTarget,
  setAgentWorkspaceMode,
  type AgentWorkspaceBrowserState,
  type RuntimeWorkspaceBrowserState
} from "./lib/workspace-browser";
import {
  getActivitySignalClass,
  getActorAvatarClass,
  getActorTone,
  getDetailCardClass,
  getIssueStatusTone,
  getInspectionHeroClass,
  getMessageSurfaceClass,
  getRuntimeStatusTone,
  getSidebarItemClass,
  getStatusDotClass,
  getStatusPillClass,
  getTimelineConnectorClass,
  getTimelineDotClass,
  getTimelineStepCardClass,
  type ActorTone,
  type StatusTone
} from "./lib/theme";
import {
  applyThemeModeToDocument,
  getThemeModeOption,
  persistThemeMode,
  readStoredThemeMode,
  themeModes,
  type ThemeMode
} from "./lib/theme-mode";

const api = createWorkPilotApiClient({
  baseUrl: "http://localhost:3001"
});

const chatPanelLayoutClassNames = getChatPanelLayoutClasses();

const initialCredentials = {
  email: "admin@workpilot.local",
  password: "demo-password"
};

const initialAgentDraft = createInitialAgentDraft();

const initialPasswordDraft = {
  currentPassword: "",
  nextPassword: "",
  confirmPassword: ""
};

const initialIssueCreateDraft = (status: IssueDTO["status"] = "backlog") => ({
  title: "",
  description: "",
  status,
  assigneeId: null as string | null,
  priority: "medium" as IssueDTO["priority"],
  dueDate: ""
});

type AuthAction = "login" | "signup";

const initialDetailPanelState: DetailPanelState = {
  isOpen: false,
  itemId: null,
  kind: null
};

type CenterView = "chat" | "issues";

const initialWorkspaceOptions = [
  {
    id: "org_demo",
    label: "abc",
    description: "Core workspace"
  },
  {
    id: "org_ops_lab",
    label: "ops-lab",
    description: "Staging workspace"
  },
  {
    id: "org_release",
    label: "release",
    description: "Release workspace"
  }
];

const initialMessageSelectionState: MessageSelectionState = {
  isMultiSelectMode: false,
  selectedIds: []
};

const agentImplementationDefinitions = listAgentImplementationDefinitions();
const runtimeCommandModeOptions: Array<{ id: RuntimeCommandMode; label: string }> = [
  { id: "npx", label: "npx" },
  { id: "bunx", label: "bunx" },
  { id: "source", label: "Source" }
];

type RuntimeCommandMode = "npx" | "bunx" | "source";
type AgentLifecycleState = "running" | "stopped";
type AgentRestartOption = "restart" | "reset_session" | "full_reset";
type IssueCreateDraft = ReturnType<typeof initialIssueCreateDraft>;

interface RuntimeConnectPanelState {
  isOpen: boolean;
  token: string;
  expiresAt: string;
  controlPlaneUrl: string;
  mode: RuntimeCommandMode;
  baselineRuntimeIds: string[];
  connectedRuntimeId: string | null;
  copied: boolean;
}

type AgentActionDialogState =
  | {
      kind: "confirm";
      action: "start" | "stop" | "delete";
      agentId: string;
      title: string;
      description: string;
      confirmLabel: string;
      confirmClassName?: string;
    }
  | {
      kind: "restart";
      agentId: string;
    };

interface RuntimeDeleteDialogState {
  runtimeId: string;
  title: string;
  description: string;
  confirmLabel: string;
}

export function App() {
  const [credentials, setCredentials] = useState(initialCredentials);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isSessionReady, setIsSessionReady] = useState(false);
  const [workspace, setWorkspace] = useState<WorkspaceBootstrapPayload | null>(null);
  const [centerView, setCenterView] = useState<CenterView>("chat");
  const [composerValue, setComposerValue] = useState("");
  const [composerAttachments, setComposerAttachments] = useState<ComposerAttachmentDraft[]>([]);
  const [accountName, setAccountName] = useState("admin");
  const [accountAvatarImage, setAccountAvatarImage] = useState<string | null>(null);
  const [accountAvatarPaletteId, setAccountAvatarPaletteId] = useState(() => getAvatarPalette("admin@workpilot.local").id);
  const [accountAvatarGlyphId, setAccountAvatarGlyphId] = useState<AvatarGlyphId>(() => getAvatarGlyph("admin@workpilot.local"));
  const [themeMode, setThemeMode] = useState<ThemeMode>(() =>
    typeof window === "undefined" ? "core" : readStoredThemeMode(window.localStorage)
  );
  const [passwordDraft, setPasswordDraft] = useState(initialPasswordDraft);
  const [settingsNotice, setSettingsNotice] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [agentActionNotice, setAgentActionNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeAuthAction, setActiveAuthAction] = useState<AuthAction>("login");
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>("msg_seed");
  const [runtimeConnectPanel, setRuntimeConnectPanel] = useState<RuntimeConnectPanelState | null>(null);
  const [runtimeConnectAutoCloseSeconds, setRuntimeConnectAutoCloseSeconds] = useState<number | null>(null);
  const [agentActionDialog, setAgentActionDialog] = useState<AgentActionDialogState | null>(null);
  const [runtimeDeleteDialog, setRuntimeDeleteDialog] = useState<RuntimeDeleteDialogState | null>(null);
  const [agentDraft, setAgentDraft] = useState<AgentDraft>(initialAgentDraft);
  const [workspaceOptions, setWorkspaceOptions] = useState(initialWorkspaceOptions);
  const [isWorkspaceSwitcherOpen, setIsWorkspaceSwitcherOpen] = useState(false);
  const [isWorkspaceCreateOpen, setIsWorkspaceCreateOpen] = useState(false);
  const [workspaceDraftName, setWorkspaceDraftName] = useState("");
  const [agentDirectChannelIds, setAgentDirectChannelIds] = useState<Record<string, string>>({});
  const [issueCreateDraft, setIssueCreateDraft] = useState<IssueCreateDraft>(() => initialIssueCreateDraft());
  const [isIssueCreateModalOpen, setIsIssueCreateModalOpen] = useState(false);
  const [draggingIssueId, setDraggingIssueId] = useState<string | null>(null);
  const [kanbanDropLane, setKanbanDropLane] = useState<IssueDTO["status"] | null>(null);
  const [kanbanFilters, setKanbanFilters] = useState<{
    assigneeId: string;
    priority: "all" | IssueDTO["priority"];
  }>({
    assigneeId: "all",
    priority: "all"
  });
  const [isStatusWorkspaceMenuOpen, setIsStatusWorkspaceMenuOpen] = useState(false);
  const [detailPanel, setDetailPanel] = useState<DetailPanelState>(initialDetailPanelState);
  const [isExplorerOpen, setIsExplorerOpen] = useState(true);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [isThemeModeMenuOpen, setIsThemeModeMenuOpen] = useState(false);
  const [isRuntimeCreateMenuOpen, setIsRuntimeCreateMenuOpen] = useState(false);
  const [isCreateAgentModalOpen, setIsCreateAgentModalOpen] = useState(false);
  const [isChannelCreateOpen, setIsChannelCreateOpen] = useState(false);
  const [isChannelCreateModalOpen, setIsChannelCreateModalOpen] = useState(false);
  const [isChannelsCollapsed, setIsChannelsCollapsed] = useState(false);
  const [isAgentsCollapsed, setIsAgentsCollapsed] = useState(false);
  const [expandedRuntimeIds, setExpandedRuntimeIds] = useState<Record<string, boolean>>({});
  const [channelDraftName, setChannelDraftName] = useState("");
  const [shellState, setShellState] = useState<ShellState>(() => createInitialShellState([], "org_demo"));
  const [agentWorkspace, setAgentWorkspace] = useState<AgentWorkspaceBrowserState>(() => createInitialAgentWorkspaceBrowserState(null));
  const [runtimeWorkspace, setRuntimeWorkspace] = useState<RuntimeWorkspaceBrowserState>(() =>
    createInitialRuntimeWorkspaceBrowserState(null)
  );
  const [selectedRuntimeIdForPage, setSelectedRuntimeIdForPage] = useState<string | null>(null);
  const [messageSelection, setMessageSelection] = useState<MessageSelectionState>(initialMessageSelectionState);
  const [bulkIssueDescription, setBulkIssueDescription] = useState("");
  const [messageContextMenu, setMessageContextMenu] = useState<{ messageId: string; x: number; y: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const messageScrollerRef = useRef<HTMLDivElement | null>(null);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const workspaceSwitcherRef = useRef<HTMLDivElement | null>(null);
  const statusWorkspaceMenuRef = useRef<HTMLDivElement | null>(null);
  const previousMessageCountRef = useRef(0);

  useEffect(() => {
    applyThemeModeToDocument(themeMode, document);
    persistThemeMode(window.localStorage, themeMode);
  }, [themeMode]);

  const pathname = usePathname();
  const navigate = useNavigate();

  useEffect(() => {
    if (!session && pathname !== "/login") {
      return;
    }

    if (session && pathname === "/login") {
      navigate("/workspace/org_demo");
      return;
    }

    if (!workspace) return;

    const routerState = parseRouterState(pathname);

    if (routerState.isLoginPage && session) {
      navigate(`/workspace/${routerState.workspaceId || "org_demo"}`);
      return;
    }

    setShellState((current) => ({
      ...current,
      workspaceId: routerState.workspaceId,
      primaryView: routerState.primaryView === "issues" ? "kanban" : routerState.primaryView,
      activeTarget: routerState.activeChannelId
        ? { kind: "channel", id: routerState.activeChannelId }
        : routerState.activeAgentId
        ? { kind: "agent", id: routerState.activeAgentId }
        : current.activeTarget,
      detailOpen: false,
    }));

    if (routerState.primaryView === "issues") {
      setCenterView("issues");
    } else if (routerState.primaryView === "chat") {
      setCenterView("chat");
    }
  }, [pathname, session, workspace]);

  useEffect(() => {
    let cancelled = false;

    void api
      .getMe()
      .then((response) => {
        if (cancelled) {
          return;
        }

        setSession(response.session);
        setAccountName(response.session.email.split("@")[0] ?? "admin");
        setAccountAvatarImage(null);
        setAccountAvatarPaletteId(getAvatarPalette(response.session.email).id);
        setAccountAvatarGlyphId(getAvatarGlyph(response.session.email));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) {
          setIsSessionReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!session) {
      return;
    }

    let cancelled = false;

    async function refreshWorkspace() {
      const payload = await api.getWorkspaceBootstrap(shellState.workspaceId);

      if (cancelled) {
        return;
      }

      startTransition(() => {
        setWorkspace(payload);
      });
    }

    void refreshWorkspace().catch((loadError) => {
      if (!cancelled) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load workspace.");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [session, shellState.workspaceId]);

  useEffect(() => {
    if (!workspace) {
      return;
    }

    const hasTarget =
      shellState.activeTarget.kind === "channel"
        ? workspace.channels.some((channel) => channel.id === shellState.activeTarget.id)
        : workspace.agents.some((agent) => agent.id === shellState.activeTarget.id);

    if (!hasTarget) {
      setShellState(createInitialShellState(workspace.channels, shellState.workspaceId));
    }

    if (!selectedRuntimeIdForPage) {
      setSelectedRuntimeIdForPage(workspace.runtimes[0]?.id ?? null);
    }

    setAgentWorkspace((current) => {
      const nextAgentId =
        current.agentId && workspace.agents.some((agent) => agent.id === current.agentId)
          ? current.agentId
          : workspace.agents[0]?.id ?? null;
      return nextAgentId === current.agentId ? current : createInitialAgentWorkspaceBrowserState(nextAgentId);
    });

    setRuntimeWorkspace((current) => {
      const nextRuntimeId =
        current.runtimeId && workspace.runtimes.some((runtime) => runtime.id === current.runtimeId)
          ? current.runtimeId
          : workspace.runtimes[0]?.id ?? null;
      return nextRuntimeId === current.runtimeId ? current : createInitialRuntimeWorkspaceBrowserState(nextRuntimeId);
    });
  }, [selectedRuntimeIdForPage, shellState.activeTarget.id, shellState.activeTarget.kind, shellState.workspaceId, workspace]);

  useEffect(() => {
    function handleWindowPointerDown(event: MouseEvent) {
      setMessageContextMenu(null);

      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (accountMenuRef.current && !accountMenuRef.current.contains(target)) {
        setIsAccountMenuOpen(false);
      }

      if (workspaceSwitcherRef.current && !workspaceSwitcherRef.current.contains(target)) {
        setIsWorkspaceSwitcherOpen(false);
        setIsWorkspaceCreateOpen(false);
        setWorkspaceDraftName("");
      }

      if (statusWorkspaceMenuRef.current && !statusWorkspaceMenuRef.current.contains(target)) {
        setIsStatusWorkspaceMenuOpen(false);
      }
    }

    window.addEventListener("pointerdown", handleWindowPointerDown);

    return () => {
      window.removeEventListener("pointerdown", handleWindowPointerDown);
    };
  }, []);

  useEffect(() => {
    if (!runtimeConnectPanel?.isOpen || !session || runtimeConnectPanel.connectedRuntimeId) {
      return;
    }

    const organizationId = session.organizationId;
    const baselineRuntimeIds = runtimeConnectPanel.baselineRuntimeIds;
    let cancelled = false;

    async function pollRuntimes() {
      const response = await api.getRuntimes(organizationId);

      if (cancelled) {
        return;
      }

      setWorkspace((current) =>
        current
          ? {
              ...current,
              runtimes: response.runtimes
            }
          : current
      );

      const connectedRuntime = findNewlyConnectedRuntime(baselineRuntimeIds, response.runtimes);

      if (connectedRuntime) {
        setRuntimeConnectPanel((current) =>
          current
            ? {
                ...current,
                connectedRuntimeId: connectedRuntime.id
              }
            : current
        );
        setSelectedRuntimeIdForPage(connectedRuntime.id);
      }
    }

    void pollRuntimes().catch(() => {});
    const intervalId = window.setInterval(() => {
      void pollRuntimes().catch(() => {});
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [runtimeConnectPanel?.baselineRuntimeIds, runtimeConnectPanel?.connectedRuntimeId, runtimeConnectPanel?.isOpen, session]);

  useEffect(() => {
    if (!runtimeConnectPanel?.isOpen || !runtimeConnectPanel.connectedRuntimeId) {
      setRuntimeConnectAutoCloseSeconds(null);
      return;
    }

    setRuntimeConnectAutoCloseSeconds(5);

    const startedAt = Date.now();
    const intervalId = window.setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
      const remainingSeconds = Math.max(5 - elapsedSeconds, 0);

      if (remainingSeconds <= 0) {
        setRuntimeConnectAutoCloseSeconds(null);
        setRuntimeConnectPanel(null);
        window.clearInterval(intervalId);
        return;
      }

      setRuntimeConnectAutoCloseSeconds(remainingSeconds);
    }, 250);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [runtimeConnectPanel?.connectedRuntimeId, runtimeConnectPanel?.isOpen]);

  const selectedWorkspaceOption = workspaceOptions.find((option) => option.id === shellState.workspaceId) ?? workspaceOptions[0];
  const groupChannels = workspace?.channels.filter((channel) => channel.type === "group") ?? [];
  const activeAgent = shellState.activeTarget.kind === "agent" ? workspace?.agents.find((agent) => agent.id === shellState.activeTarget.id) ?? null : null;
  const resolvedActiveChannelId = resolveConversationChannelId(shellState.activeTarget, workspace);
  const activeChannelId =
    shellState.activeTarget.kind === "agent"
      ? agentDirectChannelIds[shellState.activeTarget.id] ?? resolvedActiveChannelId
      : resolvedActiveChannelId;
  const activeChannel = workspace?.channels.find((channel) => channel.id === activeChannelId) ?? null;
  const workspaceIssues = workspace?.issues ?? [];
  const activeMessages = workspace?.messages.filter((message) => message.channelId === activeChannelId) ?? [];
  const activeIssues = workspaceIssues.filter((issue) => issue.sourceChannelId === activeChannelId);
  const activeAgentLifecycleState = activeAgent?.status ?? "running";
  const activeAgentActivity =
    activeAgent ? workspace?.agentActivities.find((activity) => activity.agentId === activeAgent.id) ?? null : null;
  const activeAgentActivityBadge = activeAgent
    ? getAgentActivityBadge({
        implementation: activeAgent.implementation,
        activity: activeAgentActivity
      })
    : null;
  const isActiveAgentStopped = activeAgentLifecycleState === "stopped";
  const selectedRuntimeId = selectedRuntimeIdForPage ?? workspace?.runtimes[0]?.id ?? null;
  const selectedAgentWorkspace =
    workspace?.agents.find((agent) => agent.id === agentWorkspace.agentId) ?? workspace?.agents[0] ?? null;
  const selectedRuntimeWorkspace =
    workspace?.runtimes.find((runtime) => runtime.id === runtimeWorkspace.runtimeId) ?? workspace?.runtimes[0] ?? null;
  const selectedAgentWorkspaceChannelId = selectedAgentWorkspace
    ? agentDirectChannelIds[selectedAgentWorkspace.id] ??
      resolveConversationChannelId({ kind: "agent", id: selectedAgentWorkspace.id }, workspace)
    : "";
  const selectedAgentWorkspaceRuntime = selectedAgentWorkspace
    ? workspace?.runtimes.find((runtime) => runtime.id === selectedAgentWorkspace.runtimeId) ?? null
    : null;
  const selectedAgentWorkspaceMessages = selectedAgentWorkspace
    ? workspace?.messages.filter((message) => message.channelId === selectedAgentWorkspaceChannelId) ?? []
    : [];
  const selectedAgentWorkspaceIssues = selectedAgentWorkspace
    ? workspaceIssues.filter((issue) => issue.assigneeId === selectedAgentWorkspace.id)
    : [];
  const selectedAgentWorkspaceLifecycleState = selectedAgentWorkspace?.status ?? "running";
  const selectedAgentWorkspaceActivity =
    selectedAgentWorkspace
      ? workspace?.agentActivities.find((activity) => activity.agentId === selectedAgentWorkspace.id) ?? null
      : null;
  const isSelectedAgentWorkspaceStopped = selectedAgentWorkspaceLifecycleState === "stopped";
  const agentWorkspaceLayoutClassNames = getAgentWorkspaceLayoutClasses(agentWorkspace.mode);
  const detailContextMessages =
    shellState.primaryView === "agents" && agentWorkspace.mode === "chat" ? selectedAgentWorkspaceMessages : activeMessages;
  const currentChatChannelId =
    shellState.primaryView === "agents" && agentWorkspace.mode === "chat"
      ? selectedAgentWorkspaceChannelId || null
      : shellState.primaryView === "chat"
        ? activeChannelId || null
        : null;
  const currentChatMessages =
    currentChatChannelId ? workspace?.messages.filter((message) => message.channelId === currentChatChannelId) ?? [] : [];
  const currentChatTargetKind =
    shellState.primaryView === "agents" && agentWorkspace.mode === "chat"
      ? "agent"
      : shellState.primaryView === "chat"
        ? shellState.activeTarget.kind
        : "channel";
  const currentChatAgentActivityStatus =
    currentChatTargetKind === "agent"
      ? shellState.primaryView === "agents" && agentWorkspace.mode === "chat"
        ? selectedAgentWorkspaceActivity?.status ?? null
        : activeAgentActivity?.status ?? null
      : null;
  const runtimeWorkspaceAgents = selectedRuntimeWorkspace
    ? workspace?.agents.filter((agent) => agent.runtimeId === selectedRuntimeWorkspace.id) ?? []
    : [];
  const selectedImplementation = getAgentImplementationDefinition(agentDraft.implementation);
  const selectedImplementationSummary = getPublicImplementationSummary(selectedImplementation);
  const selectedIssue = detailPanel.kind === "issue" ? workspaceIssues.find((issue) => issue.id === detailPanel.itemId) ?? null : null;
  const selectedAgent =
    detailPanel.kind === "agent" ? workspace?.agents.find((agent) => agent.id === detailPanel.itemId) ?? null : null;
  const selectedRuntime =
    detailPanel.kind === "runtime"
      ? workspace?.runtimes.find((runtime) => runtime.id === detailPanel.itemId) ?? null
      : null;
  const selectedMessageRecords = activeMessages.filter((message) => messageSelection.selectedIds.includes(message.id));
  const selectedIssueSourceMessages =
    selectedIssue && selectedIssue.sourceChannelId === activeChannelId ? detailContextMessages : [];
  const selectedAgentForIssue =
    selectedIssue?.assigneeId ? workspace?.agents.find((agent) => agent.id === selectedIssue.assigneeId) ?? null : null;
  const connectedRuntime =
    runtimeConnectPanel?.connectedRuntimeId
      ? workspace?.runtimes.find((runtime) => runtime.id === runtimeConnectPanel.connectedRuntimeId) ?? null
      : null;
  const dialogAgent =
    agentActionDialog?.agentId ? workspace?.agents.find((agent) => agent.id === agentActionDialog.agentId) ?? null : null;
  const runtimeConnectCommand = runtimeConnectPanel
    ? buildRuntimeInstallCommand({
        mode: runtimeConnectPanel.mode,
        controlPlaneUrl: runtimeConnectPanel.controlPlaneUrl,
        token: runtimeConnectPanel.token
      })
    : null;
  const filteredKanbanIssues = useMemo(
    () =>
      workspaceIssues.filter((issue) => {
        if (kanbanFilters.assigneeId !== "all" && issue.assigneeId !== kanbanFilters.assigneeId) {
          return false;
        }
        if (kanbanFilters.priority !== "all" && issue.priority !== kanbanFilters.priority) {
          return false;
        }
        return true;
      }),
    [kanbanFilters, workspaceIssues]
  );
  const railModel = detailPanel.isOpen
    ? createInspectionRailModel({
        kind: detailPanel.kind ?? "account",
        message: null,
        issue: selectedIssue,
        agent: selectedAgent ?? selectedAgentForIssue,
        runtime: selectedRuntime ?? (selectedAgent ? workspace?.runtimes.find((runtime) => runtime.id === selectedAgent.runtimeId) ?? null : null),
        issues: activeIssues,
        messages: detailContextMessages
      })
    : null;
  const isExplorerVisible = shouldShowExplorer(isExplorerOpen, shellState.primaryView);
  const displayMessageSenderName = (message: Pick<MessageDTO, "senderId" | "senderType">) =>
    resolveMessageSenderDisplayName({
      message,
      agents: workspace?.agents ?? [],
      sessionUserId: session?.userId ?? "",
      accountName
    });

  useEffect(() => {
    if (!session || !currentChatChannelId) {
      return;
    }

    let cancelled = false;

    async function loadChatHistory() {
      const payload = await api.getChannelMessages(currentChatChannelId, {
        organizationId: shellState.workspaceId ?? undefined
      });

      if (cancelled) {
        return;
      }

      setWorkspace((current) =>
        current
          ? {
              ...mergeChannelMessages(current, currentChatChannelId, payload.messages),
              agentActivities: [
                ...current.agentActivities.filter(
                  (activity) => !payload.agentActivities.some((nextActivity) => nextActivity.agentId === activity.agentId)
                ),
                ...payload.agentActivities
              ]
            }
          : current
      );
    }

    void loadChatHistory().catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [currentChatChannelId, session, shellState.workspaceId]);

  useEffect(() => {
    if (!session || !workspace || !currentChatChannelId) {
      return;
    }

    const lastUserMessageAt =
      [...currentChatMessages].reverse().find((message) => message.senderType === "user")?.createdAt ?? null;
    const lastAgentMessageAt =
      [...currentChatMessages].reverse().find((message) => message.senderType === "agent")?.createdAt ?? null;

    if (
      !shouldPollCurrentChat({
        targetKind: currentChatTargetKind,
        activeAgentStatus: currentChatAgentActivityStatus,
        lastUserMessageAt,
        lastAgentMessageAt
      })
    ) {
      return;
    }

    let cancelled = false;
    const cursor = currentChatMessages[currentChatMessages.length - 1]?.createdAt;

    async function pollCurrentChat() {
      const payload = await api.getChannelMessages(currentChatChannelId, {
        after: cursor,
        organizationId: shellState.workspaceId ?? undefined
      });

      if (cancelled || (payload.messages.length === 0 && payload.agentActivities.length === 0)) {
        return;
      }

      setWorkspace((current) =>
        current
          ? {
              ...mergeChannelMessages(current, currentChatChannelId, [
                ...current.messages.filter((message) => message.channelId === currentChatChannelId),
                ...payload.messages
              ]),
              agentActivities: [
                ...current.agentActivities.filter(
                  (activity) => !payload.agentActivities.some((nextActivity) => nextActivity.agentId === activity.agentId)
                ),
                ...payload.agentActivities
              ]
            }
          : current
      );
    }

    const intervalId = window.setInterval(() => {
      void pollCurrentChat().catch(() => {});
    }, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [currentChatAgentActivityStatus, currentChatChannelId, currentChatMessages, currentChatTargetKind, session, shellState.workspaceId, workspace]);

  useEffect(() => {
    if (!workspace) {
      return;
    }

    const focusRuntimeId = selectedRuntimeId ?? activeAgent?.runtimeId ?? workspace.runtimes[0]?.id ?? null;

    setExpandedRuntimeIds((current) => {
      const next: Record<string, boolean> = {};

      for (const runtime of workspace.runtimes) {
        next[runtime.id] = current[runtime.id] ?? runtime.id === focusRuntimeId;
      }

      return next;
    });
  }, [activeAgent?.runtimeId, selectedRuntimeId, workspace]);

  useEffect(() => {
    if (!session) {
      return;
    }

    const targetAgentIds = new Set<string>();

    if (shellState.activeTarget.kind === "agent") {
      targetAgentIds.add(shellState.activeTarget.id);
    }

    if (selectedAgentWorkspace) {
      targetAgentIds.add(selectedAgentWorkspace.id);
    }

    for (const agentId of targetAgentIds) {
      if (agentDirectChannelIds[agentId]) {
        continue;
      }

      void ensureAgentDirectChannel(agentId).catch(() => {});
    }
  }, [agentDirectChannelIds, selectedAgentWorkspace, session, shellState.activeTarget]);

  useEffect(() => {
    const previousCount = previousMessageCountRef.current;
    const nextCount =
      shellState.primaryView === "agents" && agentWorkspace.mode === "chat"
        ? selectedAgentWorkspaceMessages.length
        : activeMessages.length;

    if (shouldAutoScrollToLatest({ previousCount, nextCount }) && messageScrollerRef.current) {
      messageScrollerRef.current.scrollTop = messageScrollerRef.current.scrollHeight;
    }

    previousMessageCountRef.current = nextCount;
  }, [activeMessages.length, agentWorkspace.mode, selectedAgentWorkspaceMessages.length, shellState.primaryView]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActiveAuthAction("login");
    setIsSubmitting(true);
    setError(null);
    setAuthNotice(null);

    try {
      const response = await api.login(credentials);
      setSession(response.session);
      setIsSessionReady(true);
      setAccountName(response.session.email.split("@")[0] ?? "admin");
      setAccountAvatarImage(null);
      setAccountAvatarPaletteId(getAvatarPalette(response.session.email).id);
      setAccountAvatarGlyphId(getAvatarGlyph(response.session.email));
      setPasswordDraft(initialPasswordDraft);
      setSettingsNotice(null);
      navigate("/workspace/org_demo");
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Unable to sign in.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRegister() {
    if (!credentials.email.trim()) {
      setError("Enter an email to create a demo signup request.");
      setAuthNotice(null);
      return;
    }

    setActiveAuthAction("signup");
    setIsSubmitting(true);
    setError(null);
    setAuthNotice(null);

    try {
      await api.register({
        email: credentials.email.trim()
      });
      setAuthNotice("Signup request captured. Use the demo credentials to enter the workspace.");
    } catch (registerError) {
      setError(registerError instanceof Error ? registerError.message : "Unable to sign up.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleOpenDetailPanel(kind: DetailPanelState["kind"], itemId: string) {
    if (!kind) {
      return;
    }

    setDetailPanel((current) => openDetailPanel(current, { kind, itemId }));
  }

  function handleCloseDetailPanel() {
    setDetailPanel((current) => closeDetailPanel(current));
  }

  async function ensureAgentDirectChannel(agentId: string) {
    if (!session) {
      return "";
    }

    const cachedChannelId = agentDirectChannelIds[agentId];
    if (cachedChannelId) {
      return cachedChannelId;
    }

    const response = await api.ensureAgentDirectChannel({
      agentId,
      userId: session.userId
    });

    setAgentDirectChannelIds((current) => ({
      ...current,
      [agentId]: response.channel.id
    }));
    setWorkspace((current) =>
      current
        ? {
            ...current,
            channels: current.channels.some((channel) => channel.id === response.channel.id)
              ? current.channels
              : [...current.channels, response.channel]
          }
        : current
    );

    return response.channel.id;
  }

  async function handleSendMessage() {
    if (!session || (!composerValue.trim() && composerAttachments.length === 0)) {
      return;
    }

    if (activeAgent && isActiveAgentStopped) {
      setAgentActionNotice(`${activeAgent.name} is stopped. Start it before sending new work.`);
      return;
    }

    const channelId =
      shellState.activeTarget.kind === "agent" && activeAgent ? await ensureAgentDirectChannel(activeAgent.id) : activeChannelId;
    if (!channelId) {
      return;
    }

    const response = await api.sendMessage({
      channelId,
      content: composerValue.trim(),
      attachments: composerAttachments.map((attachment) => ({
        name: attachment.name,
        mediaType: attachment.mediaType,
        size: attachment.size,
        kind: attachment.kind,
        dataUrl: attachment.dataUrl
      })),
      senderId: session.userId,
      senderType: "user"
    });

    setComposerValue("");
    setComposerAttachments([]);
    setWorkspace((current) =>
      current
        ? {
            ...current,
            messages: [...current.messages, response.message]
          }
        : current
    );
    setSelectedMessageId(response.message.id);
    setCenterView("chat");
    setDetailPanel(initialDetailPanelState);
    setMessageSelection(initialMessageSelectionState);
    setBulkIssueDescription("");
  }

  async function handleSendAgentWorkspaceMessage() {
    if (!session || !selectedAgentWorkspace || !selectedAgentWorkspaceChannelId || (!composerValue.trim() && composerAttachments.length === 0)) {
      return;
    }

    if (isSelectedAgentWorkspaceStopped) {
      setAgentActionNotice(`${selectedAgentWorkspace.name} is stopped. Start it before sending new work.`);
      return;
    }

    const response = await api.sendMessage({
      channelId: selectedAgentWorkspaceChannelId || (await ensureAgentDirectChannel(selectedAgentWorkspace.id)),
      content: composerValue.trim(),
      attachments: composerAttachments.map((attachment) => ({
        name: attachment.name,
        mediaType: attachment.mediaType,
        size: attachment.size,
        kind: attachment.kind,
        dataUrl: attachment.dataUrl
      })),
      senderId: session.userId,
      senderType: "user"
    });

    setComposerValue("");
    setComposerAttachments([]);
    setWorkspace((current) =>
      current
        ? {
            ...current,
            messages: [...current.messages, response.message]
          }
        : current
    );
    setSelectedMessageId(response.message.id);
    setDetailPanel(initialDetailPanelState);
    setMessageSelection(initialMessageSelectionState);
    setBulkIssueDescription("");
  }

  async function handleCreateIssueFromMessage(messageId = selectedMessageId) {
    if (!session || !messageId) {
      return;
    }

    const sourceMessage = workspace?.messages.find((message) => message.id === messageId);

    if (!sourceMessage) {
      return;
    }

    const response = await api.createIssueFromMessage({
      messageId: sourceMessage.id,
      actorId: session.userId,
      assigneeId: workspace?.agents[0]?.id ?? null,
      title: sourceMessage.content.slice(0, 48),
      description: ""
    });

    setWorkspace((current) =>
      current
        ? {
            ...current,
            issues: [...(((current as WorkspaceBootstrapPayload & { issues?: IssueDTO[] }).issues ?? []) as IssueDTO[]), response.issue]
          }
        : current
    );
    setCenterView("issues");
    setDetailPanel(initialDetailPanelState);
    setMessageSelection(initialMessageSelectionState);
    setBulkIssueDescription("");
  }

  async function handleGenerateCommand() {
    if (!session) {
      return;
    }

    setIsCreateAgentModalOpen(false);
    const command = await api.createRuntimeRegistrationCommand(
      session.organizationId,
      session.userId,
      session.role === "owner" ? "owner" : "admin"
    );
    setRuntimeConnectPanel(
      createRuntimeConnectPanel({
        token: command.token,
        expiresAt: command.expiresAt,
        controlPlaneUrl: command.controlPlaneUrl,
        baselineRuntimeIds: workspace?.runtimes.map((runtime) => runtime.id) ?? []
      })
    );
  }

  async function handleOpenRuntimeConnectPanel() {
    await handleGenerateCommand();
  }

  function handleCloseRuntimeConnectPanel() {
    setRuntimeConnectAutoCloseSeconds(null);
    setRuntimeConnectPanel(null);
  }

  async function handleCopyRuntimeCommand() {
    if (!runtimeConnectPanel) {
      return;
    }

    const command = buildRuntimeInstallCommand({
      mode: runtimeConnectPanel.mode,
      controlPlaneUrl: runtimeConnectPanel.controlPlaneUrl,
      token: runtimeConnectPanel.token
    });

    await navigator.clipboard.writeText(command);
    setRuntimeConnectPanel((current) => (current ? { ...current, copied: true } : current));
  }

  async function handleCreateAgent() {
    if (!selectedRuntimeId || !agentDraft.name.trim()) {
      return;
    }

    const response = await api.createAgent({
      runtimeId: selectedRuntimeId,
      name: agentDraft.name.trim(),
      description: agentDraft.description.trim(),
      implementation: agentDraft.implementation,
      model: agentDraft.model.trim(),
      reasoningEffort: agentDraft.reasoningEffort
    });

    setWorkspace((current) =>
      current
        ? {
            ...current,
            agents: [...current.agents, response.agent]
          }
        : current
    );
    setAgentDraft(initialAgentDraft);
    setSelectedRuntimeIdForPage(response.agent.runtimeId);
    setExpandedRuntimeIds((current) => ({
      ...current,
      [response.agent.runtimeId]: true
    }));
    setDetailPanel(initialDetailPanelState);
    setIsRuntimeCreateMenuOpen(false);
    setIsCreateAgentModalOpen(false);
  }

  function handleOpenLifecycleDialog(nextState: AgentLifecycleState, agent = activeAgent) {
    if (!agent) {
      return;
    }

    const isStarting = nextState === "running";

    setAgentActionDialog({
      kind: "confirm",
      action: isStarting ? "start" : "stop",
      agentId: agent.id,
      title: isStarting ? `Start ${agent.name}?` : `Stop ${agent.name}?`,
      description: isStarting
        ? "This queues a start request through the control-plane and marks the agent ready for new work."
        : "This queues a stop request through the control-plane and pauses new work from this chat once the daemon applies it.",
      confirmLabel: isStarting ? "Start Agent" : "Stop Agent",
      confirmClassName: isStarting
        ? undefined
        : "border-rose-200 bg-rose-600 text-white hover:bg-rose-500"
    });
  }

  function handleOpenRestartDialog(agent = activeAgent) {
    if (!agent) {
      return;
    }

    setAgentActionDialog({
      kind: "restart",
      agentId: agent.id
    });
  }

  function handleOpenDeleteDialog(agent = activeAgent) {
    if (!agent) {
      return;
    }

    setAgentActionDialog({
      kind: "confirm",
      action: "delete",
      agentId: agent.id,
      title: `Delete ${agent.name}?`,
      description: "This deletes the agent through the control-plane and asks the runtime daemon to remove its local state.",
      confirmLabel: "Delete Agent",
      confirmClassName: "border-rose-200 bg-rose-600 text-white hover:bg-rose-500"
    });
  }

  function handleCloseAgentActionDialog() {
    setAgentActionDialog(null);
  }

  function handleOpenRuntimeDeleteDialog(runtimeId: string) {
    const runtime = workspace?.runtimes.find((entry) => entry.id === runtimeId);
    if (!runtime) {
      return;
    }

    setRuntimeDeleteDialog({
      runtimeId,
      title: `Delete ${runtime.name}?`,
      description: "This soft deletes the runtime and marks all attached agents as deleted. Deleted runtimes and agents are hidden from the workspace.",
      confirmLabel: "Delete Runtime"
    });
  }

  function handleCloseRuntimeDeleteDialog() {
    setRuntimeDeleteDialog(null);
  }

  async function reloadWorkspaceSnapshot() {
    const nextWorkspace = await api.getWorkspaceBootstrap(shellState.workspaceId);
    setWorkspace(nextWorkspace);
    return nextWorkspace;
  }

  async function handleConfirmAgentAction() {
    if (!workspace || !agentActionDialog || agentActionDialog.kind !== "confirm") {
      return;
    }

    const targetAgent = workspace.agents.find((agent) => agent.id === agentActionDialog.agentId);
    const agentName = targetAgent?.name ?? "Agent";
    const action = agentActionDialog.action;

    await api.controlAgent({
      agentId: agentActionDialog.agentId,
      action
    });
    const nextWorkspace = await reloadWorkspaceSnapshot();
    setAgentActionDialog(null);

    if (action === "delete") {
      if (shellState.activeTarget.kind === "agent" && shellState.activeTarget.id === agentActionDialog.agentId) {
        setShellState((current) =>
          selectConversationTarget(current, {
            kind: "channel",
            id: getDefaultChannelId(nextWorkspace.channels)
          })
        );
      }
      setSelectedMessageId(null);
      setCenterView("chat");
      setDetailPanel(initialDetailPanelState);
      setMessageSelection(initialMessageSelectionState);
      setBulkIssueDescription("");
      setMessageContextMenu(null);
      setAgentActionNotice(`${agentName} deleted.`);
      return;
    }

    setAgentActionNotice(`${agentName} ${action === "start" ? "started" : "stopped"}.`);
  }

  async function handleRestartAgent(option: AgentRestartOption, agent = activeAgent) {
    if (!agent) {
      return;
    }

    await api.controlAgent({
      agentId: agent.id,
      action: "restart",
      restartMode: option
    });
    await reloadWorkspaceSnapshot();
    setCenterView("chat");
    setAgentActionDialog(null);

    const notice =
      option === "restart"
        ? `${agent.name} restart requested.`
        : option === "reset_session"
          ? `${agent.name} session reset requested. Memory will be kept.`
          : `${agent.name} full reset requested.`;
    setAgentActionNotice(notice);
  }

  async function handleConfirmRuntimeDelete() {
    if (!session || !workspace || !runtimeDeleteDialog) {
      return;
    }

    const runtime = workspace.runtimes.find((entry) => entry.id === runtimeDeleteDialog.runtimeId);
    await api.deleteRuntime({
      runtimeId: runtimeDeleteDialog.runtimeId,
      actorId: session.userId
    });

    const nextWorkspace = await reloadWorkspaceSnapshot();
    const nextRuntimeId = nextWorkspace.runtimes[0]?.id ?? null;

    setRuntimeDeleteDialog(null);
    setSelectedRuntimeIdForPage(nextRuntimeId);
    setRuntimeWorkspace(createInitialRuntimeWorkspaceBrowserState(nextRuntimeId));
    setDetailPanel((current) =>
      current.kind === "runtime" && current.itemId === runtimeDeleteDialog.runtimeId ? initialDetailPanelState : current
    );
    setAgentActionNotice(`${runtime?.name ?? "Runtime"} deleted.`);
  }

  async function handleCreateChannel() {
    if (!workspace || !session || !workspace.organization) {
      return;
    }

    try {
      const result = await api.createChannel({
        organizationId: workspace.organization.id,
        name: channelDraftName
      });
      const nextWorkspace = await reloadWorkspaceSnapshot();
      const path = buildPath(`/workspace/:workspaceId/channel/:channelId`, {
        workspaceId: shellState.workspaceId,
        channelId: result.channel.id,
      });
      navigate(path);
      setShellState((current) => selectConversationTarget(current, { kind: "channel", id: result.channel.id }));
      setWorkspace(nextWorkspace);
      setCenterView("chat");
      setIsChannelCreateOpen(false);
      setIsChannelCreateModalOpen(false);
      setChannelDraftName("");
      setDetailPanel(initialDetailPanelState);
    } catch {
      return;
    }
  }

  function handleOpenChannelCreateModal() {
    setIsChannelCreateModalOpen(true);
    setIsChannelCreateOpen(false);
  }

  function handleCloseChannelCreateModal() {
    setIsChannelCreateModalOpen(false);
    setChannelDraftName("");
  }

  function handleLogout() {
    setSession(null);
    setIsSessionReady(true);
    setWorkspace(null);
    setComposerValue("");
    setComposerAttachments([]);
    setRuntimeConnectPanel(null);
    setDetailPanel(initialDetailPanelState);
    setIsExplorerOpen(true);
    setIsAccountMenuOpen(false);
    setIsThemeModeMenuOpen(false);
    setIsRuntimeCreateMenuOpen(false);
    setIsCreateAgentModalOpen(false);
    setIsChannelCreateOpen(false);
    navigate("/login");
  }

  function handleResetState() {
    setIsChannelCreateModalOpen(false);
    setIsWorkspaceSwitcherOpen(false);
    setIsWorkspaceCreateOpen(false);
    setWorkspaceDraftName("");
    setAgentDirectChannelIds({});
    setWorkspaceOptions(initialWorkspaceOptions);
    setIsChannelsCollapsed(false);
    setIsAgentsCollapsed(false);
    setChannelDraftName("");
    setExpandedRuntimeIds({});
    setShellState(createInitialShellState([], "org_demo"));
    setAgentWorkspace(createInitialAgentWorkspaceBrowserState(null));
    setRuntimeWorkspace(createInitialRuntimeWorkspaceBrowserState(null));
    setSelectedRuntimeIdForPage(null);
    setMessageSelection(initialMessageSelectionState);
    setBulkIssueDescription("");
    setMessageContextMenu(null);
    setAgentActionNotice(null);
    setAgentActionDialog(null);
    setSettingsNotice(null);
    setAuthNotice(null);
    setPasswordDraft(initialPasswordDraft);
    setAccountAvatarImage(null);
    setAccountAvatarPaletteId(getAvatarPalette("admin@workpilot.local").id);
    setAccountAvatarGlyphId(getAvatarGlyph("admin@workpilot.local"));
  }

  function handleOpenSettingsPage() {
    setIsAccountMenuOpen(false);
    setIsThemeModeMenuOpen(false);
    setIsCreateAgentModalOpen(false);
    setAgentActionNotice(null);
    setAgentActionDialog(null);
    setIsExplorerOpen(true);
    setShellState((current) => selectPrimaryView(current, "settings"));
    setDetailPanel(initialDetailPanelState);
  }

  function handleSelectWorkspace(workspaceId: string) {
    if (!workspace) {
      return;
    }

    setShellState((current) => selectWorkspace(current, workspaceId, workspace.channels));
    setCenterView("chat");
    setDetailPanel(initialDetailPanelState);
    setIsAccountMenuOpen(false);
    setIsThemeModeMenuOpen(false);
    setAgentActionNotice(null);
    setAgentActionDialog(null);
    setMessageSelection(initialMessageSelectionState);
    setBulkIssueDescription("");
    setMessageContextMenu(null);
    setIsChannelCreateOpen(false);
    setChannelDraftName("");
    setIsCreateAgentModalOpen(false);
  }

  function handleCreateWorkspaceOption() {
    const label = workspaceDraftName.trim();

    if (!label) {
      return;
    }

    const idBase = label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 24);
    let nextId = `org_${idBase || "workspace"}`;
    let suffix = 1;

    while (workspaceOptions.some((option) => option.id === nextId)) {
      suffix += 1;
      nextId = `org_${idBase || "workspace"}_${suffix}`;
    }

    const nextOption = {
      id: nextId,
      label,
      description: `/${label}`
    };

    setWorkspaceOptions((current) => [...current, nextOption]);
    setWorkspaceDraftName("");
    setIsWorkspaceCreateOpen(false);

    if (workspace) {
      handleSelectWorkspace(nextOption.id);
    }
    setIsWorkspaceSwitcherOpen(false);
  }

  function handleSelectConversation(kind: "channel" | "agent", id: string) {
    if (kind === "agent" && workspace) {
      const runtimeId = workspace.agents.find((agent) => agent.id === id)?.runtimeId ?? null;

      if (runtimeId) {
        setSelectedRuntimeIdForPage(runtimeId);
        setRuntimeWorkspace(selectRuntimeWorkspaceTarget(runtimeId));
        setExpandedRuntimeIds((current) => ({
          ...current,
          [runtimeId]: true
        }));
      }

      setAgentWorkspace(selectAgentWorkspaceTarget(id));
    }

    const path = buildPath(`/workspace/:workspaceId/${kind}/:id`, {
      workspaceId: shellState.workspaceId,
      kind,
      id,
    });
    navigate(path);
    setShellState((current) => selectConversationTarget(current, { kind, id }));
    setCenterView("chat");
    setDetailPanel(initialDetailPanelState);
    setAgentActionNotice(null);
    setAgentActionDialog(null);
    setMessageSelection(initialMessageSelectionState);
    setBulkIssueDescription("");
    setMessageContextMenu(null);
    setIsChannelCreateOpen(false);
    setChannelDraftName("");
    setIsCreateAgentModalOpen(false);
  }

  function handleSelectPrimaryView(primaryView: "chat" | "kanban" | "agents" | "runtimes" | "settings") {
    const path = buildPath(`/workspace/:workspaceId/${primaryView === "kanban" ? "issues" : primaryView}`, {
      workspaceId: shellState.workspaceId,
    });
    navigate(path);
    setShellState((current) => selectPrimaryView(current, primaryView));
    setDetailPanel(initialDetailPanelState);
    setAgentActionNotice(null);
    setAgentActionDialog(null);
    setIsRuntimeCreateMenuOpen(false);
    setIsCreateAgentModalOpen(false);
    setMessageSelection(initialMessageSelectionState);
    setBulkIssueDescription("");
    setMessageContextMenu(null);
    setIsChannelCreateOpen(false);
  }

  function handleSelectActivityView(primaryView: "chat" | "kanban" | "agents" | "runtimes" | "settings") {
    if (shellState.primaryView === primaryView) {
      setIsExplorerOpen((current) => !current);
      return;
    }

    setIsExplorerOpen(true);
    if (primaryView === "settings") {
      handleOpenSettingsPage();
      return;
    }

    handleSelectPrimaryView(primaryView);
  }

  function handleOpenAgentCreateModal(runtimeId: string | null) {
    const result = openAgentCreationFromSidebar(shellState, runtimeId);
    setShellState(result.shellState);
    setSelectedRuntimeIdForPage(result.runtimeId);
    if (result.runtimeId) {
      const nextRuntimeId = result.runtimeId;
      setExpandedRuntimeIds((current) => ({
        ...current,
        [nextRuntimeId]: true
      }));
    }
    setIsCreateAgentModalOpen(true);
    setIsRuntimeCreateMenuOpen(false);
    setIsChannelCreateOpen(false);
    setAgentActionNotice(null);
    setAgentActionDialog(null);
    setDetailPanel(initialDetailPanelState);
  }

  function handleOpenAgentCreateFromSidebar() {
    handleOpenAgentCreateModal(selectedRuntimeId ?? workspace?.runtimes[0]?.id ?? null);
  }

  function handleOpenAgentWorkspace(agentId: string) {
    const runtimeId = workspace?.agents.find((agent) => agent.id === agentId)?.runtimeId ?? null;
    const path = buildPath("/workspace/:workspaceId/agents", {
      workspaceId: shellState.workspaceId,
    });

    setAgentWorkspace(selectAgentWorkspaceTarget(agentId));
    if (runtimeId) {
      setSelectedRuntimeIdForPage(runtimeId);
      setRuntimeWorkspace(selectRuntimeWorkspaceTarget(runtimeId));
    }
    navigate(path);
    setShellState((current) => selectPrimaryView(current, "agents"));
    setDetailPanel(initialDetailPanelState);
    setAgentActionNotice(null);
    setAgentActionDialog(null);
  }

  function handleOpenRuntimeWorkspace(runtimeId: string) {
    setRuntimeWorkspace(selectRuntimeWorkspaceTarget(runtimeId));
    setSelectedRuntimeIdForPage(runtimeId);
    setShellState((current) => selectPrimaryView(current, "runtimes"));
    setDetailPanel(initialDetailPanelState);
    setAgentActionNotice(null);
    setAgentActionDialog(null);
  }

  function handleCloseAgentCreateModal() {
    setIsCreateAgentModalOpen(false);
    setAgentDraft(initialAgentDraft);
  }

  function handleSaveAccountProfile() {
    setSettingsNotice("Profile updated locally.");
  }

  function handleChangePassword() {
    if (!passwordDraft.currentPassword || !passwordDraft.nextPassword || !passwordDraft.confirmPassword) {
      setSettingsNotice("Fill in all password fields.");
      return;
    }

    if (passwordDraft.nextPassword !== passwordDraft.confirmPassword) {
      setSettingsNotice("New password confirmation does not match.");
      return;
    }

    setPasswordDraft(initialPasswordDraft);
    setSettingsNotice("Password updated locally.");
  }

  async function handleAvatarFileChange(event: FormEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) {
      return;
    }

    const dataUrl = await readFileAsDataUrl(file);
    setAccountAvatarImage(dataUrl);
    setSettingsNotice("Avatar updated locally.");
    event.currentTarget.value = "";
  }

  function handleOpenAvatarPicker() {
    avatarInputRef.current?.click();
  }

  function handleMessageContextMenu(event: ReactMouseEvent<HTMLElement>, messageId: string) {
    event.preventDefault();
    setMessageContextMenu({
      messageId,
      x: event.clientX,
      y: event.clientY
    });
  }

  function handleEnterMultiSelect(messageId: string) {
    setMessageSelection(createSelectionState(messageId));
    setBulkIssueDescription("");
    setMessageContextMenu(null);
    setDetailPanel(initialDetailPanelState);
  }

  function handleToggleMessageSelection(messageId: string) {
    setMessageSelection((current) => toggleMessageSelection(current, messageId));
  }

  function handleClearMessageSelection() {
    setMessageSelection((current) => clearSelection(current));
    setBulkIssueDescription("");
  }

  async function handleComposerPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));

    if (files.length === 0) {
      return;
    }

    event.preventDefault();
    const drafts = await createComposerAttachmentDrafts(files);
    setComposerAttachments((current) => [...current, ...drafts]);
  }

  async function handleComposerFileChange(event: FormEvent<HTMLInputElement>) {
    const drafts = await createComposerAttachmentDraftsFromFileList(event.currentTarget.files);

    if (drafts.length > 0) {
      setComposerAttachments((current) => [...current, ...drafts]);
    }

    event.currentTarget.value = "";
  }

  function handleOpenComposerFilePicker() {
    fileInputRef.current?.click();
  }

  function handleRemoveComposerAttachment(attachmentId: string) {
    setComposerAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
  }

  function handleChannelDraftKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (shouldSubmitInlineDraftFromKeypress({ key: event.key, isComposing: event.nativeEvent.isComposing })) {
      event.preventDefault();
      handleCreateChannel();
    }
  }

  async function handleBulkCreateIssues() {
    if (!session || selectedMessageRecords.length === 0) {
      return;
    }

    const response = await api.createIssueFromMessages({
      messageIds: selectedMessageRecords.map((message) => message.id),
      actorId: session.userId,
      assigneeId: workspace?.agents[0]?.id ?? null,
      title: createBatchIssueTitle(selectedMessageRecords.length),
      description: bulkIssueDescription.trim()
    });

    setWorkspace((current) =>
      current
        ? {
            ...current,
            issues: [...(((current as WorkspaceBootstrapPayload & { issues?: IssueDTO[] }).issues ?? []) as IssueDTO[]), response.issue]
          }
        : current
    );
    setCenterView("issues");
    setMessageSelection(initialMessageSelectionState);
    setBulkIssueDescription("");
  }

  function handleOpenIssueCreateModal(status: IssueDTO["status"]) {
    setIssueCreateDraft(initialIssueCreateDraft(status));
    setIsIssueCreateModalOpen(true);
  }

  function handleCloseIssueCreateModal() {
    setIsIssueCreateModalOpen(false);
    setIssueCreateDraft(initialIssueCreateDraft());
  }

  async function handleCreateIssue() {
    if (!session || !issueCreateDraft.title.trim()) {
      return;
    }

    const response = await api.createIssue({
      actorId: session.userId,
      title: issueCreateDraft.title.trim(),
      description: issueCreateDraft.description.trim(),
      status: issueCreateDraft.status,
      assigneeId: issueCreateDraft.assigneeId,
      priority: issueCreateDraft.priority,
      dueDate: issueCreateDraft.dueDate ? new Date(issueCreateDraft.dueDate).toISOString() : null,
      project: null,
      sourceChannelId: null
    });

    setWorkspace((current) =>
      current
        ? {
            ...current,
            issues: [...(((current as WorkspaceBootstrapPayload & { issues?: IssueDTO[] }).issues ?? []) as IssueDTO[]), response.issue]
          }
        : current
    );

    handleCloseIssueCreateModal();
  }

  async function handleMoveIssue(issueId: string, nextStatus: IssueDTO["status"]) {
    const currentIssue = workspaceIssues.find((issue) => issue.id === issueId);

    if (!currentIssue || currentIssue.status === nextStatus) {
      setDraggingIssueId(null);
      setKanbanDropLane(null);
      return;
    }

    setWorkspace((current) =>
      current
        ? {
            ...current,
            issues: current.issues.map((issue) =>
              issue.id === issueId
                ? {
                    ...issue,
                    status: nextStatus,
                    updatedAt: new Date().toISOString()
                  }
                : issue
            )
          }
        : current
    );

    try {
      const response = await api.updateIssue({
        issueId,
        status: nextStatus
      });

      setWorkspace((current) =>
        current
          ? {
              ...current,
              issues: current.issues.map((issue) => (issue.id === issueId ? response.issue : issue))
            }
          : current
      );
    } catch {
      setWorkspace((current) =>
        current
          ? {
              ...current,
              issues: current.issues.map((issue) => (issue.id === issueId ? currentIssue : issue))
            }
          : current
      );
    } finally {
      setDraggingIssueId(null);
      setKanbanDropLane(null);
    }
  }

  function handleBulkDeleteMessages() {
    if (messageSelection.selectedIds.length === 0) {
      return;
    }

    const selectedIds = new Set(messageSelection.selectedIds);

    setWorkspace((current) =>
      current
        ? {
            ...current,
            messages: current.messages.filter((message) => !selectedIds.has(message.id)),
            issues: (((current as WorkspaceBootstrapPayload & { issues?: IssueDTO[] }).issues ?? []) as IssueDTO[])
          }
        : current
    );
    setDetailPanel((current) =>
      current.kind === "message" && current.itemId && selectedIds.has(current.itemId) ? initialDetailPanelState : current
    );
    setMessageSelection(initialMessageSelectionState);
    setBulkIssueDescription("");
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      shouldSendMessageFromKeypress({
        key: event.key,
        shiftKey: event.shiftKey,
        isComposing: event.nativeEvent.isComposing
      })
    ) {
      event.preventDefault();
      void handleSendMessage();
    }
  }

  function handleAgentWorkspaceComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      shouldSendMessageFromKeypress({
        key: event.key,
        shiftKey: event.shiftKey,
        isComposing: event.nativeEvent.isComposing
      })
    ) {
      event.preventDefault();
      void handleSendAgentWorkspaceMessage();
    }
  }

  if (!isSessionReady) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#ffffff_0%,_#eef4ff_58%,_#e2e8f0_100%)] px-6 py-10 text-neutral-950">
        <div className="rounded-[1.5rem] border border-neutral-200 bg-white/85 px-6 py-5 text-sm font-medium text-neutral-600 shadow-[0_12px_40px_rgba(15,23,42,0.08)] backdrop-blur-sm">
          Loading workspace...
        </div>
      </main>
    );
  }

  if (!session) {
    if (pathname !== "/login") {
      navigate("/login");
      return null;
    }
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#ffffff_0%,_#eef4ff_58%,_#e2e8f0_100%)] px-6 py-10 text-neutral-950">
        <div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-6xl gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-[2rem] border border-neutral-200 bg-white/90 p-8 shadow-[0_12px_40px_rgba(15,23,42,0.08)] backdrop-blur-sm lg:p-12">
            <Badge className="border-neutral-300 bg-neutral-900 text-white">Agent Ops Workspace</Badge>
            <h1 className="mt-6 text-5xl font-semibold tracking-[-0.04em] text-neutral-950 lg:text-7xl">
              WorkPilot turns chat, runtime control, and issue flow into one surface.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-neutral-600">
              Channels host humans and Agents together. Runtime daemons register into your organization. Agent output,
              execution state, and issue creation stay pinned to the same conversation graph.
            </p>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              <HeroStat label="Presence" value="humans + agents" />
              <HeroStat label="Flow" value="chat -> issue -> result" />
              <HeroStat label="Deploy" value="self-hosted first" />
            </div>
          </section>

          <Card className="self-center border-neutral-200 bg-white">
            <CardHeader>
              <Badge className="w-fit border-sky-200 bg-sky-50 text-sky-700">Demo Login</Badge>
              <CardTitle className="text-3xl font-semibold tracking-[-0.03em]">Enter the workspace</CardTitle>
              <CardDescription>
                The demo organization ships with a connected runtime daemon, one Agent, a seeded channel, and issue history.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handleLogin}>
                <div className="grid grid-cols-2 gap-2 rounded-[1rem] border border-neutral-200 bg-[var(--panel-muted)] p-1">
                  <button
                    className={`rounded-[0.85rem] px-4 py-2.5 text-sm font-semibold transition ${
                      activeAuthAction === "login"
                        ? "bg-[var(--accent)] text-white shadow-[0_10px_20px_rgba(79,70,229,0.18)]"
                        : "text-neutral-600 hover:bg-white hover:text-neutral-950"
                    }`}
                    onClick={() => {
                      setActiveAuthAction("login");
                      setAuthNotice(null);
                    }}
                    type="submit"
                  >
                    Login
                  </button>
                  <button
                    className={`rounded-[0.85rem] px-4 py-2.5 text-sm font-semibold transition ${
                      activeAuthAction === "signup"
                        ? "bg-white text-[var(--accent-strong)] shadow-[0_8px_18px_rgba(15,23,42,0.08)]"
                        : "text-neutral-600 hover:bg-white hover:text-neutral-950"
                    }`}
                    disabled={isSubmitting}
                    onClick={(event) => {
                      event.preventDefault();
                      void handleRegister();
                    }}
                    type="button"
                  >
                    Sign up
                  </button>
                </div>
                <label className="block text-sm font-medium text-neutral-700">
                  Email
                  <Input
                    className="mt-2"
                    value={credentials.email}
                    onChange={(event) => setCredentials((current) => ({ ...current, email: event.target.value }))}
                  />
                </label>
                <label className="block text-sm font-medium text-neutral-700">
                  Password
                  <Input
                    className="mt-2"
                    type="password"
                    value={credentials.password}
                    onChange={(event) => setCredentials((current) => ({ ...current, password: event.target.value }))}
                  />
                </label>
                {error ? <p className="text-sm font-medium text-rose-700">{error}</p> : null}
                {authNotice ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-medium text-emerald-700">{authNotice}</p> : null}
                <div className="flex flex-col gap-3">
                  <Button className="w-full" disabled={isSubmitting} size="lg" type="submit">
                    <UserRound className="size-4" />
                    {isSubmitting && activeAuthAction === "login" ? "Signing in..." : "Enter Demo Workspace"}
                  </Button>
                  <button
                    className="text-sm font-medium text-neutral-500 transition hover:text-[var(--accent-strong)]"
                    disabled={isSubmitting}
                    onClick={(event) => {
                      event.preventDefault();
                      setCredentials(initialCredentials);
                      setError(null);
                      setAuthNotice("Demo credentials restored.");
                      setActiveAuthAction("login");
                    }}
                    type="button"
                  >
                    Restore demo credentials
                  </button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell flex h-screen w-full flex-col overflow-hidden px-0 py-0">
      <div className={getAppShellGridClass({ detailOpen: detailPanel.isOpen, explorerVisible: isExplorerVisible })}>
        <aside className="shell-panel shell-panel--sidebar relative flex h-full min-h-0 flex-col items-center overflow-visible rounded-none border-r-0 px-2 py-3">
          <div ref={workspaceSwitcherRef} className="relative">
            <button
              className="flex size-11 items-center justify-center rounded-[1rem] border border-neutral-200 bg-white text-neutral-800 shadow-[0_6px_18px_rgba(15,23,42,0.06)] transition hover:border-neutral-300"
              onClick={() => setIsWorkspaceSwitcherOpen((current) => !current)}
              type="button"
            >
              <span className="text-sm font-semibold tracking-[-0.03em]">{selectedWorkspaceOption.label.slice(0, 1).toUpperCase()}</span>
            </button>

            {isWorkspaceSwitcherOpen ? (
              <div className="absolute left-[calc(100%+0.75rem)] top-0 z-30 w-72 overflow-hidden rounded-[1.2rem] border border-neutral-200 bg-white shadow-[0_20px_40px_rgba(15,23,42,0.14)]">
                <div className="border-b border-neutral-200 p-2">
                  {workspaceOptions.map((option) => (
                    <button
                      key={option.id}
                      className={`flex w-full items-start gap-3 rounded-[0.95rem] px-3 py-3 text-left transition ${
                        option.id === shellState.workspaceId
                          ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                          : "hover:bg-neutral-50"
                      }`}
                      onClick={() => {
                        handleSelectWorkspace(option.id);
                        setIsWorkspaceSwitcherOpen(false);
                      }}
                      type="button"
                    >
                      <span className="mt-0.5 text-base leading-none">{option.id === shellState.workspaceId ? "✓" : ""}</span>
                      <span className="min-w-0">
                        <span className="block truncate text-[15px] font-semibold text-neutral-950">{option.label}</span>
                        <span className="mt-1 block truncate text-sm text-neutral-400">/{option.label}</span>
                      </span>
                    </button>
                  ))}
                </div>

                <div className="p-2">
                  {isWorkspaceCreateOpen ? (
                    <div className="rounded-[0.95rem] border border-neutral-200 bg-neutral-50 p-3">
                      <Input
                        autoFocus
                        className="h-10"
                        onChange={(event) => setWorkspaceDraftName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            handleCreateWorkspaceOption();
                          }
                        }}
                        placeholder="Workspace name"
                        value={workspaceDraftName}
                      />
                      <div className="mt-3 flex items-center justify-end gap-2">
                        <Button
                          onClick={() => {
                            setIsWorkspaceCreateOpen(false);
                            setWorkspaceDraftName("");
                          }}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          Cancel
                        </Button>
                        <Button disabled={!workspaceDraftName.trim()} onClick={handleCreateWorkspaceOption} size="sm" type="button">
                          Create
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <button
                      className="flex w-full items-center gap-3 rounded-[0.95rem] px-3 py-3 text-left text-[15px] font-semibold transition hover:bg-neutral-50"
                      onClick={() => setIsWorkspaceCreateOpen(true)}
                      type="button"
                    >
                      <Plus className="size-4" />
                      Switch or create workspace
                    </button>
                  )}
                </div>
              </div>
            ) : null}
          </div>

          <div className="mt-5 flex flex-1 flex-col items-center gap-2">
            <ActivityBarButton
              active={shellState.primaryView === "chat"}
              icon={MessageSquareText}
              label="Chats"
              onClick={() => handleSelectActivityView("chat")}
            />
            <ActivityBarButton
              active={shellState.primaryView === "kanban"}
              icon={KanbanSquare}
              label="Kanban"
              onClick={() => handleSelectActivityView("kanban")}
            />
            <ActivityBarButton
              active={shellState.primaryView === "agents"}
              icon={Bot}
              label="Agents"
              onClick={() => handleSelectActivityView("agents")}
            />
            <ActivityBarButton
              active={shellState.primaryView === "runtimes"}
              icon={Monitor}
              label="Runtimes"
              onClick={() => handleSelectActivityView("runtimes")}
            />
          </div>

          <div ref={accountMenuRef} className="relative mt-auto flex flex-col items-center gap-2">
            {isAccountMenuOpen ? (
              <div className="absolute bottom-[calc(100%+0.75rem)] left-[calc(100%+0.75rem)] z-20 w-72 rounded-[1.35rem] border border-neutral-200 bg-white p-3 shadow-[0_20px_40px_rgba(15,23,42,0.14)]">
                <div className="rounded-[1rem] border border-neutral-200 bg-neutral-50 p-3">
                  <p className="text-lg font-semibold tracking-[-0.02em]">{session.email.split("@")[0]}</p>
                  <p className="mt-1 text-sm text-neutral-500">{session.email}</p>
                </div>
                <div className="mt-3 grid gap-2">
                  <MenuAction onClick={handleOpenSettingsPage}>
                    <Settings className="size-4" />
                    Settings
                  </MenuAction>
                  <MenuAction onClick={handleLogout}>
                    <LogOut className="size-4" />
                    Log out
                  </MenuAction>
                </div>
              </div>
            ) : null}

            <button
              className="flex size-11 items-center justify-center rounded-[1rem] border border-neutral-200 bg-white shadow-[0_6px_18px_rgba(15,23,42,0.06)] transition hover:border-neutral-300"
              onClick={() => {
                setIsAccountMenuOpen((current) => {
                  const next = !current;
                  if (!next) {
                    setIsThemeModeMenuOpen(false);
                  }
                  return next;
                });
              }}
              type="button"
            >
              <AvatarBadge imageUrl={accountAvatarImage} glyphId={accountAvatarGlyphId} name={accountName} paletteId={accountAvatarPaletteId} size="sm" />
            </button>
            <ActivityBarButton active={shellState.primaryView === "settings"} icon={Settings} label="Settings" onClick={() => handleSelectActivityView("settings")} />
          </div>
        </aside>

        {isExplorerVisible ? (
        <aside className="shell-panel shell-panel--sidebar flex h-full min-h-0 flex-col overflow-hidden rounded-none border-r-0">
          <div className="border-b border-neutral-200 px-4 py-4">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">Workspace</p>
            <p className="mt-1 text-base font-semibold tracking-[-0.03em] text-neutral-950">{selectedWorkspaceOption.label}</p>
          </div>

          <div className="border-b border-neutral-200 px-4 py-3">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
              {shellState.primaryView === "chat"
                ? "Chats"
                : shellState.primaryView === "kanban"
                  ? "Kanban"
                : shellState.primaryView === "agents"
                  ? "Agents"
                  : shellState.primaryView === "runtimes"
                    ? "Runtimes"
                    : "Settings"}
            </p>
            <p className="mt-1 text-xs text-neutral-400">
              {shellState.primaryView === "chat"
                ? `${groupChannels.length} conversations`
                : shellState.primaryView === "kanban"
                  ? `${workspaceIssues.length} issues`
                : shellState.primaryView === "agents"
                  ? `${workspace?.agents.length ?? 0} available agents`
                  : shellState.primaryView === "runtimes"
                    ? `${workspace?.runtimes.length ?? 0} connected hosts`
                    : "Profile and preferences"}
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
            {shellState.primaryView === "chat" ? (
              <SidebarSection
                action={
                  <button
                    className="panel-control flex size-8 items-center justify-center rounded-lg text-neutral-700"
                    onClick={handleOpenChannelCreateModal}
                    type="button"
                  >
                    <Plus className="size-4" />
                  </button>
                }
                collapsed={isChannelsCollapsed}
                onToggle={() => setIsChannelsCollapsed((current) => !current)}
                title="Channels"
                count={groupChannels.length}
              >
                <div className="grid gap-1.5">
                  {groupChannels.map((channel) => {
                    const isActive = shellState.activeTarget.kind === "channel" && shellState.activeTarget.id === channel.id;

                    return (
                      <button
                        key={channel.id}
                        className={`${getSidebarItemClass("channel", isActive)} px-3 py-3 text-neutral-700`}
                        onClick={() => handleSelectConversation("channel", channel.id)}
                        type="button"
                      >
                        <div className="flex items-center gap-2 font-medium">
                          <MessageSquareText className="size-4" />
                          {getChannelDisplayName(channel)}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </SidebarSection>
            ) : null}

            {shellState.primaryView === "kanban" ? (
              <div className="grid gap-3">
                <div className="rounded-[1rem] border border-neutral-200 bg-white p-4">
                  <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Board</p>
                  <p className="mt-2 text-sm font-medium text-neutral-900">Issue Kanban</p>
                  <p className="mt-1 text-xs leading-5 text-neutral-500">
                    A global board is always available, even when there are no issues yet.
                  </p>
                </div>
                <div className="rounded-[1rem] border border-dashed border-neutral-200 bg-white/70 p-4">
                  <p className="text-sm font-medium text-neutral-900">Empty state ready</p>
                  <p className="mt-1 text-xs leading-5 text-neutral-500">
                    Create the first issue and it will appear in the Kanban lanes.
                  </p>
                </div>
              </div>
            ) : null}

            {shellState.primaryView === "agents" ? (
              <SidebarSection
                action={
                  <button
                    className="panel-control flex size-8 items-center justify-center rounded-lg text-neutral-700"
                    onClick={handleOpenAgentCreateFromSidebar}
                    type="button"
                  >
                    <Plus className="size-4" />
                  </button>
                }
                title="Directory"
                count={workspace?.agents.length ?? 0}
              >
                <div className="grid gap-1.5">
                  {(workspace?.agents ?? []).map((agent) => {
                    const runtimeName = workspace?.runtimes.find((runtime) => runtime.id === agent.runtimeId)?.name ?? agent.runtimeId;
                    const isSelected = selectedAgentWorkspace?.id === agent.id;
                    return (
                      <button
                        key={agent.id}
                        className={`rounded-[0.95rem] border px-3 py-3 text-left transition ${
                          isSelected
                            ? "border-emerald-200 bg-emerald-50/80"
                            : "border-transparent bg-white/70 hover:border-neutral-200 hover:bg-white"
                        }`}
                        onClick={() => handleOpenAgentWorkspace(agent.id)}
                        type="button"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`${getActorAvatarClass("agent")} size-9 text-emerald-700`}>
                            <Bot className="size-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-neutral-900">{agent.name}</p>
                            <p className="mt-1 truncate font-mono text-[11px] text-neutral-500">{runtimeName}</p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </SidebarSection>
            ) : null}

            {shellState.primaryView === "runtimes" ? (
              <div className="space-y-4">
                <div className="relative">
                  <div className="mb-3 flex items-center justify-between gap-3 px-1">
                    <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">Hosts</p>
                    <button
                      className="panel-control flex size-8 items-center justify-center rounded-lg text-neutral-700"
                      onClick={() => setIsRuntimeCreateMenuOpen((current) => !current)}
                      type="button"
                    >
                      <Plus className="size-4" />
                    </button>
                  </div>

                  {isRuntimeCreateMenuOpen ? (
                    <div className="absolute right-0 top-10 z-20 w-56 rounded-[1.1rem] border border-neutral-200 bg-white shadow-[var(--shadow-md)]">
                      <button
                        className="flex w-full items-center gap-3 border-b border-neutral-200 bg-[var(--accent-soft)] px-4 py-4 text-left text-sm font-medium text-[var(--accent-strong)]"
                        onClick={() => {
                          void handleGenerateCommand();
                          setIsRuntimeCreateMenuOpen(false);
                        }}
                        type="button"
                      >
                        <Plus className="size-4" />
                        Add Runtime
                      </button>
                      <button
                        className="flex w-full items-center gap-3 px-4 py-4 text-left text-sm font-medium"
                        onClick={() => handleOpenAgentCreateModal(selectedRuntimeIdForPage ?? workspace?.runtimes[0]?.id ?? null)}
                        type="button"
                      >
                        <Plus className="size-4" />
                        Create Agent
                      </button>
                    </div>
                  ) : null}
                </div>

                <div className="grid gap-1.5">
                  {(workspace?.runtimes ?? []).map((runtime) => {
                    const isSelected = selectedRuntimeWorkspace?.id === runtime.id;
                    return (
                      <button
                        key={runtime.id}
                        className={`rounded-[0.95rem] border px-3 py-3 text-left transition ${
                          isSelected
                            ? "border-emerald-200 bg-emerald-50/80"
                            : "border-transparent bg-white/70 hover:border-neutral-200 hover:bg-white"
                        }`}
                        onClick={() => handleOpenRuntimeWorkspace(runtime.id)}
                        type="button"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-neutral-900">{runtime.name}</p>
                            <p className="mt-1 truncate font-mono text-[11px] text-neutral-500">{runtime.id}</p>
                          </div>
                          <StatusPill tone={getRuntimeStatusTone(runtime.status)}>{runtime.status}</StatusPill>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {shellState.primaryView === "settings" ? (
              <div className="grid gap-3">
                <div className="rounded-[1rem] border border-neutral-200 bg-white p-4">
                  <p className="text-sm font-semibold text-neutral-900">{accountName}</p>
                  <p className="mt-1 text-xs text-neutral-500">{session.email}</p>
                </div>
                <div className="rounded-[1rem] border border-neutral-200 bg-white p-4">
                  <p className="text-sm font-medium text-neutral-900">Appearance</p>
                  <p className="mt-1 text-xs text-neutral-500">{getThemeModeOption(themeMode).label}</p>
                </div>
              </div>
            ) : null}
          </div>
        </aside>
        ) : null}

        <section className="shell-panel shell-panel--main flex h-full min-h-0 flex-col overflow-hidden rounded-none">
          {shellState.primaryView === "chat" ? (
            <div className={chatPanelLayoutClassNames.shell}>
              <div className={`${chatPanelLayoutClassNames.topChrome} bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(251,252,255,0.96)_100%)] backdrop-blur-sm`}>
                <div className={`${chatPanelLayoutClassNames.header} border-b border-neutral-200 px-4 py-4 lg:px-5`}>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-2.5">
                      {shellState.activeTarget.kind === "channel" ? (
                        <MessageSquareText className="size-5 text-[var(--accent)]" />
                      ) : (
                        <Bot className="size-5 text-[var(--accent)]" />
                      )}
                      <div className="min-w-0">
                        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--accent-strong)]">
                          {shellState.activeTarget.kind === "agent" ? "Active agent thread" : "Current thread"}
                        </p>
                        <h1 className="truncate text-[24px] font-semibold tracking-[-0.04em] lg:text-[26px]">
                          {formatConversationTitle({
                            kind: shellState.activeTarget.kind,
                            name:
                              shellState.activeTarget.kind === "channel"
                                ? getChannelDisplayName(activeChannel ?? { id: "", type: "group", name: "all" })
                                : activeAgent?.name ?? "Agent"
                          })}
                        </h1>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Badge>{activeMessages.length} messages</Badge>
                      <Badge>{activeIssues.length} issues</Badge>
                      {activeAgent ? (
                        <Badge>{activeAgentActivityBadge?.label ?? (activeAgentLifecycleState === "running" ? "running" : "stopped")}</Badge>
                      ) : null}
                      {activeAgent ? (
                        <>
                          <Button
                            onClick={() => handleOpenLifecycleDialog(activeAgentLifecycleState === "running" ? "stopped" : "running")}
                            size="sm"
                            type="button"
                            variant="secondary"
                          >
                            {activeAgentLifecycleState === "running" ? "Stop" : "Start"}
                          </Button>
                          <Button onClick={handleOpenRestartDialog} size="sm" type="button" variant="secondary">
                            Restart
                          </Button>
                          <Button
                            className="border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                            onClick={handleOpenDeleteDialog}
                            size="sm"
                            type="button"
                            variant="secondary"
                          >
                            Delete
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </div>
                  {agentActionNotice ? (
                    <div className="mt-4 rounded-[1rem] border border-[rgba(244,114,182,0.2)] bg-[rgba(255,241,248,0.96)] px-3 py-3 text-sm text-neutral-700 shadow-[0_8px_24px_rgba(244,114,182,0.08)]">
                      {agentActionNotice}
                    </div>
                  ) : null}
                  {activeAgent && activeAgentActivityBadge ? (
                    <div className="mt-4 flex flex-wrap items-start gap-3 rounded-[1rem] border border-amber-200 bg-[linear-gradient(135deg,rgba(255,251,235,0.98),rgba(255,247,237,0.94))] px-3 py-3 text-sm text-neutral-700 shadow-[0_10px_24px_rgba(245,158,11,0.10)]">
                      <StatusPill tone={activeAgentActivityBadge.tone}>{activeAgentActivityBadge.label}</StatusPill>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-neutral-900">{activeAgentActivityBadge.summary}</p>
                        {activeAgentActivityBadge.detail ? <p className="mt-1 text-xs text-neutral-500">{activeAgentActivityBadge.detail}</p> : null}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className={`${chatPanelLayoutClassNames.tabs} border-b border-neutral-200 bg-[var(--panel-muted)]/80 px-4 py-2.5 lg:px-5`}>
                  <div className="flex gap-2">
                    <TabButton active={centerView === "chat"} icon={MessageSquareText} label="Chat" onClick={() => setCenterView("chat")} />
                    <TabButton active={centerView === "issues"} icon={ClipboardList} label="Issues" onClick={() => setCenterView("issues")} />
                  </div>
                </div>
              </div>

              <div className={`${chatPanelLayoutClassNames.content} px-4 py-4 lg:px-5`}>
                {centerView === "chat" ? (
                  <div className="relative flex h-full min-h-0 flex-col">
                    {messageSelection.isMultiSelectMode ? (
                      <div className="mb-3 rounded-[1rem] border border-[var(--warning-border)] bg-[var(--warning-soft)] px-3 py-3 shadow-[0_8px_18px_rgba(245,158,11,0.14)]">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                          <p className="text-sm font-semibold text-neutral-900">{messageSelection.selectedIds.length} messages selected</p>
                          <p className="mt-1 text-xs text-neutral-600">Right click starts selection mode. Click more messages to build a batch.</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Button onClick={handleBulkCreateIssues} size="sm" type="button" variant="secondary">
                              <Sparkles className="size-4" />
                              Create Issue
                            </Button>
                            <Button onClick={handleBulkDeleteMessages} size="sm" type="button" variant="secondary">
                              Delete Messages
                            </Button>
                            <Button onClick={handleClearMessageSelection} size="sm" type="button" variant="ghost">
                              Cancel
                            </Button>
                          </div>
                        </div>
                        <label className="mt-3 block">
                          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Issue Description</span>
                          <textarea
                            className="mt-2 min-h-[84px] w-full rounded-xl border border-[var(--warning-border)] bg-white px-3 py-2.5 text-sm leading-6 text-neutral-800 outline-none transition placeholder:text-neutral-400 focus:border-[var(--accent)]"
                            onChange={(event) => setBulkIssueDescription(event.target.value)}
                            placeholder="Add a brief issue description. The selected messages become the source context."
                            value={bulkIssueDescription}
                          />
                        </label>
                      </div>
                    ) : null}

                    <div ref={messageScrollerRef} className={`${chatPanelLayoutClassNames.scroller} rounded-[1.15rem] border border-neutral-200 bg-[var(--panel-elevated)] p-3`}>
                      <div className="grid gap-1">
                      {activeMessages.length === 0 ? (
                        <EmptyState>No messages yet. Start the conversation.</EmptyState>
                      ) : (
                        activeMessages.map((message) => {
                          const tone = getActorTone(message.senderType);
                          const isSelected = selectedMessageId === message.id;
                          const isMultiSelected = messageSelection.selectedIds.includes(message.id);
                          const senderDisplayName = displayMessageSenderName(message);
                          const timestamp = createTimestampLabels(message.createdAt);

                          return (
                            <div
                              key={message.id}
                              className={`${getMessageSurfaceClass(tone, isSelected)} ${isMultiSelected ? "ring-2 ring-amber-300" : ""}`}
                              onContextMenu={(event) => handleMessageContextMenu(event, message.id)}
                              onClick={() => {
                                if (messageSelection.isMultiSelectMode) {
                                  handleToggleMessageSelection(message.id);
                                  return;
                                }

                                setSelectedMessageId(message.id);
                              }}
                              role="button"
                              tabIndex={0}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex min-w-0 flex-1 items-start gap-3 text-left">
                                  {messageSelection.isMultiSelectMode ? (
                                    <span
                                      className={`mt-1 flex size-5 shrink-0 items-center justify-center rounded-md border ${
                                        isMultiSelected ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-strong)]" : "border-neutral-300 bg-white"
                                      }`}
                                    >
                                      {isMultiSelected ? "✓" : ""}
                                    </span>
                                  ) : null}
                                  {message.senderType === "agent" ? (
                                    <div className={`${getActorAvatarClass(tone)} mt-0.5 size-10`}>
                                      <Bot className="size-4" />
                                    </div>
                                  ) : (
                                    <AvatarBadge
                                      imageUrl={message.senderId === session.userId ? accountAvatarImage : null}
                                      glyphId={
                                        message.senderId === session.userId
                                          ? accountAvatarGlyphId
                                          : getAvatarGlyph(message.senderId)
                                      }
                                      name={senderDisplayName}
                                      paletteId={
                                        message.senderId === session.userId
                                          ? accountAvatarPaletteId
                                          : getAvatarPalette(message.senderId).id
                                      }
                                      size="sm"
                                    />
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                      <span className={tone === "agent" ? "font-mono text-[12.5px] font-semibold text-neutral-950" : "text-[13px] font-semibold text-neutral-900"}>
                                        {senderDisplayName}
                                      </span>
                                      {tone === "agent" ? <StatusDot tone="success" /> : null}
                                      <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-neutral-400">{message.senderType}</span>
                                      <span className="font-mono text-[11px] text-neutral-400" title={timestamp.precise}>
                                        {timestamp.compact}
                                      </span>
                                    </div>
                                    {getMessageAttachments(message.attachments).length > 0 ? (
                                      <div className="mt-3">
                                        <MessageAttachmentGallery attachments={message.attachments} />
                                      </div>
                                    ) : null}
                                    {message.content ? (
                                      <p className={`mt-1.5 select-text whitespace-pre-wrap break-words leading-6 ${tone === "agent" ? "font-mono text-[12.5px] text-neutral-800" : "text-[13px] text-neutral-700"}`}>
                                        {message.content}
                                      </p>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                      </div>
                    </div>

                    {messageContextMenu ? (
                      <div
                        className="fixed z-30 w-56 rounded-[1rem] border border-neutral-200 bg-white shadow-[var(--shadow-md)]"
                        style={{ left: messageContextMenu.x, top: messageContextMenu.y }}
                      >
                        <button
                          className="flex w-full items-center gap-3 px-4 py-4 text-left text-sm font-medium hover:bg-neutral-50"
                          onClick={() => handleEnterMultiSelect(messageContextMenu.messageId)}
                          type="button"
                        >
                          <Plus className="size-4" />
                          Multi-select messages
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className={`${chatPanelLayoutClassNames.scroller} rounded-[1.25rem] border border-neutral-200 bg-[var(--panel-elevated)] p-3`}>
                    <div className="grid gap-2.5">
                    {activeIssues.length === 0 ? (
                      <EmptyState>No issues in this conversation yet.</EmptyState>
                    ) : (
                      activeIssues.map((issue) => {
                        const tone = getIssueStatusTone(issue.status);
                        const isSelected = detailPanel.kind === "issue" && detailPanel.itemId === issue.id;

                        return (
                          <button
                            key={issue.id}
                            className={`rounded-[1.15rem] border px-4 py-4 transition ${
                              isSelected
                                ? "border-[var(--accent)] bg-[linear-gradient(180deg,rgba(79,70,229,0.18)_0%,rgba(79,70,229,0.92)_100%)] text-white shadow-[0_16px_34px_rgba(79,70,229,0.18)]"
                                : "border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50"
                            }`}
                            onClick={() => handleOpenDetailPanel("issue", issue.id)}
                            type="button"
                          >
                            <div className="min-w-0 text-left">
                                <IssueCard selected={isSelected} issue={issue} tone={tone} />
                            </div>
                          </button>
                        );
                      })
                    )}
                    </div>
                  </div>
                )}
              </div>

              <div className={`${chatPanelLayoutClassNames.composer} border-t border-neutral-200 bg-[var(--panel-muted)]/80 p-3 lg:p-4`}>
                <div className="grid gap-3">
                  <input
                    ref={fileInputRef}
                    accept="image/*,.pdf,.txt,.log,.md,.json,.csv,.zip"
                    className="hidden"
                    disabled={isActiveAgentStopped}
                    multiple
                    onChange={handleComposerFileChange}
                    type="file"
                  />
                  {composerAttachments.length > 0 ? (
                    <div className="rounded-[1rem] border border-neutral-200 bg-white/90 p-3 shadow-[var(--shadow-xs)]">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Resources</p>
                        <span className="text-xs text-neutral-500">{composerAttachments.length} attached</span>
                      </div>
                      <ComposerAttachmentGallery
                        attachments={composerAttachments}
                        onRemove={handleRemoveComposerAttachment}
                      />
                    </div>
                  ) : null}
                  <textarea
                    className={`min-h-[92px] w-full resize-none rounded-[1rem] border px-4 py-3 text-sm shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)] outline-none placeholder:text-neutral-400 ${
                      isActiveAgentStopped
                        ? "border-neutral-200 bg-neutral-100 text-neutral-400"
                        : "border-neutral-300 bg-white text-neutral-950 focus:border-[var(--accent)] focus-visible:ring-4 focus-visible:ring-[var(--accent-soft)]"
                    }`}
                    disabled={isActiveAgentStopped}
                    placeholder={
                      isActiveAgentStopped
                        ? `@${activeAgent?.name ?? "Agent"} is stopped. Start it to send new work.`
                        : shellState.activeTarget.kind === "channel"
                        ? `Message #${getChannelDisplayName(activeChannel ?? { id: "", type: "group", name: "all" })}`
                        : `Message @${activeAgent?.name ?? "Agent"}`
                    }
                    value={composerValue}
                    onChange={(event) => setComposerValue(event.target.value)}
                    onKeyDown={handleComposerKeyDown}
                    onPaste={handleComposerPaste}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <button
                      className={`panel-control flex size-10 items-center justify-center rounded-xl ${
                        isActiveAgentStopped ? "cursor-not-allowed text-neutral-300" : "text-neutral-700"
                      }`}
                      disabled={isActiveAgentStopped}
                      onClick={handleOpenComposerFilePicker}
                      type="button"
                    >
                      <Plus className="size-4" />
                    </button>
                    <p className="font-mono text-[10px] text-neutral-400">
                      {isActiveAgentStopped
                        ? "Agent is stopped. Start it to resume sending work."
                        : "Enter to send, Shift+Enter for newline, use + or paste for local resources"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : shellState.primaryView === "kanban" ? (
            <div className="flex h-full flex-col">
              <div className="border-b border-neutral-200 px-5 py-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <KanbanSquare className="size-5 text-neutral-400" />
                      <h1 className="text-[30px] font-semibold tracking-[-0.04em]">Kanban</h1>
                    </div>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-500">
                      Issue board grouped by workflow state. The board is visible by default even when the workspace has no issues yet.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button onClick={() => handleOpenIssueCreateModal("backlog")} size="sm" type="button">
                      <Plus className="size-4" />
                      Add Issue
                    </Button>
                  </div>
                </div>
                <div className="mt-4 flex flex-col gap-3 rounded-[1.15rem] border border-neutral-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.96)_0%,rgba(255,255,255,1)_100%)] p-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-center gap-2 text-neutral-500">
                    <SlidersHorizontal className="size-4" />
                    <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em]">Board Filters</span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[480px]">
                    <select
                      className="h-10 rounded-xl border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none focus:border-[var(--accent)]"
                      value={kanbanFilters.assigneeId}
                      onChange={(event) =>
                        setKanbanFilters((current) => ({
                          ...current,
                          assigneeId: event.target.value
                        }))
                      }
                    >
                      <option value="all">All assignees</option>
                      {(workspace?.agents ?? []).map((agent) => (
                        <option key={agent.id} value={agent.id}>
                          {agent.name}
                        </option>
                      ))}
                    </select>
                    <select
                      className="h-10 rounded-xl border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none focus:border-[var(--accent)]"
                      value={kanbanFilters.priority}
                      onChange={(event) =>
                        setKanbanFilters((current) => ({
                          ...current,
                          priority: event.target.value as "all" | IssueDTO["priority"]
                        }))
                      }
                    >
                      <option value="all">All priorities</option>
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden p-4 lg:p-5">
                <div className="grid h-full min-w-[1500px] grid-cols-5 gap-4">
                  {[
                    { id: "backlog", label: "Backlog", tone: "neutral" as const, helper: "Ready for product grooming" },
                    { id: "todo", label: "Todo", tone: "neutral" as const, helper: "Ready for iteration planning" },
                    { id: "in_progress", label: "In Progress", tone: "warning" as const, helper: "Active development only" },
                    { id: "in_review", label: "In Review", tone: "warning" as const, helper: "Review, test, and acceptance" },
                    { id: "done", label: "Done", tone: "success" as const, helper: "Merged, deployed, accepted" }
                  ].map((lane) => {
                    const laneIssues = filteredKanbanIssues.filter((issue) => issue.status === lane.id);
                    const isDropActive = kanbanDropLane === lane.id;

                    return (
                      <section
                        key={lane.id}
                        className={`flex min-h-0 flex-col rounded-[1.35rem] border p-3 shadow-[0_16px_34px_rgba(15,23,42,0.05)] transition ${
                          isDropActive
                            ? "border-[var(--accent)] bg-[linear-gradient(180deg,rgba(79,70,229,0.08)_0%,rgba(255,255,255,0.98)_100%)]"
                            : "border-neutral-200 bg-[var(--panel-elevated)]"
                        }`}
                        onDragOver={(event) => {
                          event.preventDefault();
                          if (kanbanDropLane !== lane.id) {
                            setKanbanDropLane(lane.id);
                          }
                        }}
                        onDragLeave={(event) => {
                          if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
                            return;
                          }
                          setKanbanDropLane((current) => (current === lane.id ? null : current));
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          const issueId = event.dataTransfer.getData("text/plain");
                          if (!issueId) {
                            setKanbanDropLane(null);
                            return;
                          }
                          void handleMoveIssue(issueId, lane.id);
                        }}
                      >
                        <div className="mb-3 rounded-[1rem] border border-neutral-200 bg-white px-3 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <span
                                className={`inline-flex min-w-10 items-center justify-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${
                                  lane.tone === "success"
                                    ? "bg-emerald-100 text-emerald-700"
                                    : lane.tone === "warning"
                                      ? "bg-amber-100 text-amber-700"
                                      : lane.tone === "danger"
                                        ? "bg-rose-100 text-rose-700"
                                        : "bg-slate-100 text-slate-700"
                                }`}
                              >
                                {laneIssues.length}
                              </span>
                              <div>
                                <p className="text-sm font-semibold text-neutral-950">{lane.label}</p>
                                <p className="mt-1 text-xs text-neutral-500">{isDropActive ? "Drop here to move issue" : lane.helper}</p>
                              </div>
                            </div>
                            <button
                              className="panel-control flex size-9 items-center justify-center rounded-xl text-neutral-700"
                              onClick={() => handleOpenIssueCreateModal(lane.id)}
                              type="button"
                            >
                              <Plus className="size-4" />
                            </button>
                          </div>
                        </div>

                        <div className="min-h-0 flex-1 overflow-y-auto">
                          {laneIssues.length === 0 ? (
                            <div className="flex h-full min-h-[240px] items-center justify-center rounded-[1.1rem] border border-dashed border-neutral-200 bg-white/80 p-6 text-center">
                              <div>
                                <p className="text-sm font-medium text-neutral-900">No issues in {lane.label}</p>
                                <p className="mt-2 text-xs leading-5 text-neutral-500">
                                  The board stays visible even when the lane is empty.
                                </p>
                              </div>
                            </div>
                          ) : (
                            <div className="grid gap-3">
                              {laneIssues.map((issue) => (
                                <article
                                  key={issue.id}
                                  className={`rounded-[1.1rem] border border-neutral-200 bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.05)] transition ${
                                    draggingIssueId === issue.id
                                      ? "scale-[0.98] rotate-[1deg] opacity-60"
                                      : "cursor-grab hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-[0_16px_30px_rgba(15,23,42,0.08)]"
                                  }`}
                                  draggable
                                  onClick={() => handleOpenDetailPanel("issue", issue.id)}
                                  onDragStart={(event) => {
                                    event.dataTransfer.effectAllowed = "move";
                                    event.dataTransfer.setData("text/plain", issue.id);
                                    setDraggingIssueId(issue.id);
                                  }}
                                  onDragEnd={() => {
                                    setDraggingIssueId(null);
                                    setKanbanDropLane(null);
                                  }}
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="flex min-w-0 items-start gap-2">
                                      <span className="mt-0.5 text-neutral-300">
                                        <GripVertical className="size-4" />
                                      </span>
                                      <div className="min-w-0">
                                        <p className="truncate text-sm font-semibold text-neutral-950">{issue.title}</p>
                                        <div className="mt-2 flex flex-wrap items-center gap-2">
                                          <StatusPill tone={lane.tone}>{issue.priority}</StatusPill>
                                        </div>
                                      </div>
                                    </div>
                                    {issue.assigneeId ? (
                                      <div
                                        className="flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
                                        style={{
                                          backgroundColor: getAvatarPalette(issue.assigneeId).background,
                                          color: getAvatarPalette(issue.assigneeId).foreground
                                        }}
                                      >
                                        {getAvatarInitials(
                                          workspace?.agents.find((agent) => agent.id === issue.assigneeId)?.name ?? issue.assigneeId
                                        )}
                                      </div>
                                    ) : null}
                                  </div>
                                  <p className="mt-3 line-clamp-3 text-sm leading-6 text-neutral-600">
                                    {issue.description || "No description yet."}
                                  </p>
                                  <div className="mt-4 flex items-center justify-between gap-3 text-xs text-neutral-500">
                                    <span className="truncate">
                                      {issue.assigneeId
                                        ? workspace?.agents.find((agent) => agent.id === issue.assigneeId)?.name ?? "Assigned"
                                        : "Unassigned"}
                                    </span>
                                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                                      <CalendarDays className="size-3.5" />
                                      {issue.dueDate ? formatTimestamp(issue.dueDate) : "No due date"}
                                    </span>
                                  </div>
                                </article>
                              ))}
                            </div>
                          )}
                        </div>
                      </section>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : shellState.primaryView === "agents" ? (
            <div className="flex h-full flex-col">
              <div className={agentWorkspaceLayoutClassNames.viewport}>
                {selectedAgentWorkspace ? (
                  <div className={agentWorkspaceLayoutClassNames.content}>
                    <div className="overflow-hidden rounded-[1.25rem] bg-white">
                      <div className="flex flex-col gap-2 border-b border-neutral-200 px-5 py-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`${getActorAvatarClass("agent")} size-10 text-emerald-700`}>
                            <Bot className="size-5" />
                          </div>
                          <div className="flex items-center gap-2">
                            <h2 className="text-[22px] font-semibold tracking-[-0.04em] text-neutral-950">{selectedAgentWorkspace.name}</h2>
                            <StatusPill tone={selectedAgentWorkspace.status === "running" ? "success" : "warning"}>
                              {selectedAgentWorkspace.status}
                            </StatusPill>
                            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-neutral-400">
                              {selectedAgentWorkspace.implementation} / {selectedAgentWorkspace.model} / {selectedAgentWorkspace.reasoningEffort}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            aria-label="Stop agent"
                            className="flex h-10 items-center justify-center gap-2 rounded-[0.95rem] border border-[color:color-mix(in_srgb,var(--accent)_18%,white)] bg-[color:color-mix(in_srgb,var(--surface)_88%,white)] px-3 text-sm font-medium text-[var(--text-primary)] shadow-[0_8px_18px_rgba(15,23,42,0.05)] transition hover:border-[color:color-mix(in_srgb,var(--accent)_28%,white)] hover:bg-[color:color-mix(in_srgb,var(--accent-soft)_62%,white)] disabled:cursor-not-allowed disabled:border-neutral-200 disabled:bg-neutral-100 disabled:text-neutral-300"
                            disabled={selectedAgentWorkspace.status === "stopped"}
                            onClick={() => handleOpenLifecycleDialog("stopped", selectedAgentWorkspace)}
                            type="button"
                          >
                            <Square className="size-4" />
                            <span>Stop</span>
                          </button>
                          <button
                            aria-label="Reset agent"
                            className="flex h-10 items-center justify-center gap-2 rounded-[0.95rem] border border-[color:color-mix(in_srgb,var(--accent)_18%,white)] bg-[color:color-mix(in_srgb,var(--surface)_88%,white)] px-3 text-sm font-medium text-[var(--text-primary)] shadow-[0_8px_18px_rgba(15,23,42,0.05)] transition hover:border-[color:color-mix(in_srgb,var(--accent)_28%,white)] hover:bg-[color:color-mix(in_srgb,var(--accent-soft)_62%,white)]"
                            onClick={() => handleOpenRestartDialog(selectedAgentWorkspace)}
                            type="button"
                          >
                            <RotateCcw className="size-4" />
                            <span>Reset</span>
                          </button>
                          <button
                            aria-label="Delete agent"
                            className="flex h-10 items-center justify-center gap-2 rounded-[0.95rem] border border-[color:color-mix(in_srgb,#fb7185_34%,white)] bg-[color:color-mix(in_srgb,#ffe4e6_72%,white)] px-3 text-sm font-medium text-rose-700 shadow-[0_8px_18px_rgba(244,63,94,0.09)] transition hover:border-[color:color-mix(in_srgb,#fb7185_50%,white)] hover:bg-[color:color-mix(in_srgb,#ffe4e6_92%,white)]"
                            onClick={() => handleOpenDeleteDialog(selectedAgentWorkspace)}
                            type="button"
                          >
                            <Trash2 className="size-4" />
                            <span>Delete</span>
                          </button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-0 border-b border-neutral-200 bg-[var(--panel-muted)]/55 px-2">
                        <AgentModeTab
                          active={agentWorkspace.mode === "chat"}
                          icon={MessageSquareText}
                          label="Chat"
                          onClick={() => setAgentWorkspace((current) => setAgentWorkspaceMode(current, "chat"))}
                        />
                        <AgentModeTab
                          active={agentWorkspace.mode === "issues"}
                          icon={ClipboardList}
                          label="Issues"
                          onClick={() => setAgentWorkspace((current) => setAgentWorkspaceMode(current, "issues"))}
                        />
                        <AgentModeTab
                          active={agentWorkspace.mode === "profile"}
                          icon={FileText}
                          label="Profile"
                          onClick={() => setAgentWorkspace((current) => setAgentWorkspaceMode(current, "profile"))}
                        />
                      </div>
                    </div>

                    {agentWorkspace.mode === "profile" ? (
                      <>
                        <DetailCard accent="agent">
                          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Prompt Constraint</p>
                          <p className="mt-3 text-sm leading-7 text-neutral-700">{selectedAgentWorkspace.description}</p>
                        </DetailCard>
                        <div className="grid gap-4 lg:grid-cols-3">
                          <DetailCard>
                            <DetailRow label="Runtime" value={selectedAgentWorkspaceRuntime?.name ?? selectedAgentWorkspace.runtimeId} />
                            <DetailRow label="Messages" value={String(selectedAgentWorkspaceMessages.length)} />
                            <DetailRow label="Assigned Issues" value={String(selectedAgentWorkspaceIssues.length)} />
                          </DetailCard>
                          <DetailCard>
                            <DetailRow label="Implementation" value={selectedAgentWorkspace.implementation} />
                            <DetailRow label="Model" value={selectedAgentWorkspace.model} />
                            <DetailRow label="Reasoning" value={selectedAgentWorkspace.reasoningEffort} />
                          </DetailCard>
                          <DetailCard>
                            <div className="flex flex-col gap-2">
                              <Button
                                onClick={() => handleSelectConversation("agent", selectedAgentWorkspace.id)}
                                type="button"
                                variant="secondary"
                              >
                                <MessageSquareText className="size-4" />
                                Open Chat Thread
                              </Button>
                              <Button onClick={() => handleOpenAgentCreateModal(selectedAgentWorkspace.runtimeId)} type="button" variant="ghost">
                                <Plus className="size-4" />
                                Create Sibling Agent
                              </Button>
                            </div>
                          </DetailCard>
                        </div>
                        <DetailCard accent="agent">
                          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Recent Activity</p>
                          <div className="mt-3 grid gap-2">
                            {selectedAgentWorkspaceMessages.length === 0 ? (
                              <p className="text-sm text-neutral-500">This agent has not posted any messages yet.</p>
                            ) : (
                              selectedAgentWorkspaceMessages.slice(-4).reverse().map((message) => (
                                <button
                                  key={message.id}
                                  className="rounded-xl border border-neutral-200 bg-white px-3 py-3 text-left transition hover:border-neutral-300 hover:bg-neutral-50"
                                  onClick={() => {
                                    handleSelectConversation("agent", selectedAgentWorkspace.id);
                                    setSelectedMessageId(message.id);
                                  }}
                                  type="button"
                                >
                                  <div className="flex items-center justify-between gap-3">
                                    <span
                                      className="font-mono text-[11px] uppercase tracking-[0.16em] text-neutral-400"
                                      title={createTimestampLabels(message.createdAt).precise}
                                    >
                                      {createTimestampLabels(message.createdAt).compact}
                                    </span>
                                    <span className="text-xs text-neutral-500">{message.channelId}</span>
                                  </div>
                                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-neutral-700">{message.content || "Attachment only update"}</p>
                                </button>
                              ))
                            )}
                          </div>
                        </DetailCard>
                      </>
                    ) : agentWorkspace.mode === "issues" ? (
                      <div className="rounded-[1.25rem] border border-neutral-200 bg-[var(--panel-elevated)] p-3 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
                        <div className="mb-3 flex items-center justify-between gap-3 px-1">
                          <div>
                            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Assigned Issues</p>
                            <p className="mt-1 text-xs text-neutral-400">{selectedAgentWorkspaceIssues.length} issues assigned</p>
                          </div>
                          <Button onClick={() => handleOpenIssueCreateModal("backlog")} size="sm" type="button" variant="ghost">
                            <Plus className="size-4" />
                            Add Issue
                          </Button>
                        </div>
                        <div className="grid gap-2">
                          {selectedAgentWorkspaceIssues.length === 0 ? (
                            <EmptyState>No issues are assigned to this agent yet.</EmptyState>
                          ) : (
                            selectedAgentWorkspaceIssues.map((issue) => (
                              <button
                                key={issue.id}
                                className="rounded-[1rem] border border-neutral-200 bg-white px-4 py-4 text-left transition hover:border-neutral-300 hover:bg-neutral-50"
                                onClick={() => handleOpenDetailPanel("issue", issue.id)}
                                type="button"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-neutral-950">{issue.title}</p>
                                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-neutral-600">
                                      {issue.description || "No description yet."}
                                    </p>
                                  </div>
                                  <StatusPill tone={getIssueStatusTone(issue.status)}>{formatIssueStatus(issue.status)}</StatusPill>
                                </div>
                                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                                  <span>{issue.priority} priority</span>
                                  <span>{issue.dueDate ? formatTimestamp(issue.dueDate) : "No due date"}</span>
                                  <span>{issue.sourceChannelId ? "From channel" : "Global issue"}</span>
                                </div>
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className={`flex ${agentWorkspaceLayoutClassNames.chatPanel}`}>
                        <div ref={messageScrollerRef} className="min-h-0 flex-1 overflow-y-auto p-3">
                          <div className="grid gap-1">
                            {selectedAgentWorkspaceMessages.length === 0 ? (
                              <EmptyState>No private messages yet. Start the conversation.</EmptyState>
                            ) : (
                              selectedAgentWorkspaceMessages.map((message) => {
                                const tone = getActorTone(message.senderType);
                                const isSelected = selectedMessageId === message.id;
                                const senderDisplayName = displayMessageSenderName(message);
                                const timestamp = createTimestampLabels(message.createdAt);

                                return (
                                  <div
                                    key={message.id}
                                    className={getMessageSurfaceClass(tone, isSelected)}
                                    onClick={() => {
                                      setSelectedMessageId(message.id);
                                    }}
                                    role="button"
                                    tabIndex={0}
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="flex min-w-0 flex-1 items-start gap-3 text-left">
                                        {message.senderType === "agent" ? (
                                          <div className={`${getActorAvatarClass(tone)} mt-0.5 size-10`}>
                                            <Bot className="size-4" />
                                          </div>
                                        ) : (
                                          <AvatarBadge
                                            imageUrl={message.senderId === session.userId ? accountAvatarImage : null}
                                            glyphId={
                                              message.senderId === session.userId
                                                ? accountAvatarGlyphId
                                                : getAvatarGlyph(message.senderId)
                                            }
                                            name={senderDisplayName}
                                            paletteId={
                                              message.senderId === session.userId
                                                ? accountAvatarPaletteId
                                                : getAvatarPalette(message.senderId).id
                                            }
                                            size="sm"
                                          />
                                        )}
                                        <div className="min-w-0 flex-1">
                                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                            <span className={tone === "agent" ? "font-mono text-[12.5px] font-semibold text-neutral-950" : "text-[13px] font-semibold text-neutral-900"}>
                                              {senderDisplayName}
                                            </span>
                                            {tone === "agent" ? <StatusDot tone="success" /> : null}
                                            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-neutral-400">
                                              {message.senderType}
                                            </span>
                                            <span className="font-mono text-[11px] text-neutral-400" title={timestamp.precise}>
                                              {timestamp.compact}
                                            </span>
                                          </div>
                                          {getMessageAttachments(message.attachments).length > 0 ? (
                                            <div className="mt-3">
                                              <MessageAttachmentGallery attachments={message.attachments} />
                                            </div>
                                          ) : null}
                                          {message.content ? (
                                            <p className={`mt-1.5 select-text whitespace-pre-wrap break-words leading-6 ${tone === "agent" ? "font-mono text-[12.5px] text-neutral-800" : "text-[13px] text-neutral-700"}`}>
                                              {message.content}
                                            </p>
                                          ) : null}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>
                        <div className="border-t border-neutral-200 bg-[var(--panel-muted)]/80 p-3 lg:p-4">
                          <div className="grid gap-3">
                            <input
                              ref={fileInputRef}
                              accept="image/*,.pdf,.txt,.log,.md,.json,.csv,.zip"
                              className="hidden"
                              disabled={isSelectedAgentWorkspaceStopped}
                              multiple
                              onChange={handleComposerFileChange}
                              type="file"
                            />
                            {composerAttachments.length > 0 ? (
                              <div className="rounded-[1rem] border border-neutral-200 bg-white/90 p-3 shadow-[var(--shadow-xs)]">
                                <div className="mb-3 flex items-center justify-between gap-3">
                                  <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Resources</p>
                                  <span className="text-xs text-neutral-500">{composerAttachments.length} attached</span>
                                </div>
                                <ComposerAttachmentGallery attachments={composerAttachments} onRemove={handleRemoveComposerAttachment} />
                              </div>
                            ) : null}
                            <textarea
                              className={`min-h-[92px] w-full resize-none rounded-[1rem] border px-4 py-3 text-sm shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)] outline-none placeholder:text-neutral-400 ${
                                isSelectedAgentWorkspaceStopped
                                  ? "border-neutral-200 bg-neutral-100 text-neutral-400"
                                  : "border-neutral-300 bg-white text-neutral-950 focus:border-[var(--accent)] focus-visible:ring-4 focus-visible:ring-[var(--accent-soft)]"
                              }`}
                              disabled={isSelectedAgentWorkspaceStopped}
                              placeholder={
                                isSelectedAgentWorkspaceStopped
                                  ? `@${selectedAgentWorkspace.name} is stopped. Start it to send new work.`
                                  : `Message @${selectedAgentWorkspace.name}`
                              }
                              value={composerValue}
                              onChange={(event) => setComposerValue(event.target.value)}
                              onKeyDown={handleAgentWorkspaceComposerKeyDown}
                              onPaste={handleComposerPaste}
                            />
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <button
                                className={`panel-control flex size-10 items-center justify-center rounded-xl ${
                                  isSelectedAgentWorkspaceStopped ? "cursor-not-allowed text-neutral-300" : "text-neutral-700"
                                }`}
                                disabled={isSelectedAgentWorkspaceStopped}
                                onClick={handleOpenComposerFilePicker}
                                type="button"
                              >
                                <Plus className="size-4" />
                              </button>
                              <p className="font-mono text-[10px] text-neutral-400">
                                {isSelectedAgentWorkspaceStopped
                                  ? "Agent is stopped. Start it to resume sending work."
                                  : "Private chat with this agent. Enter to send, Shift+Enter for newline."}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <EmptyState>No agents available yet.</EmptyState>
                )}
              </div>
            </div>
          ) : shellState.primaryView === "runtimes" ? (
            <div className="flex h-full flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-5">
                {selectedRuntimeWorkspace ? (
                  <div className="mx-auto max-w-6xl space-y-4">
                    <div className="rounded-[1.25rem] border border-neutral-200 bg-white p-4">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <Monitor className="size-5 text-neutral-700" />
                            <h2 className="text-[26px] font-semibold tracking-[-0.04em] text-neutral-950">{selectedRuntimeWorkspace.name}</h2>
                          </div>
                          <p className="mt-1 font-mono text-[11px] text-neutral-400">{selectedRuntimeWorkspace.id}</p>
                        </div>
                        <StatusPill tone={getRuntimeStatusTone(selectedRuntimeWorkspace.status)}>{selectedRuntimeWorkspace.status}</StatusPill>
                      </div>
                    </div>
                    <div className="grid gap-4 lg:grid-cols-3">
                      <DetailCard>
                        <DetailRow label="Status" value={selectedRuntimeWorkspace.status} />
                        <DetailRow label="Agents" value={String(runtimeWorkspaceAgents.length)} />
                        <DetailRow label="Mode" value="daemon host" />
                      </DetailCard>
                      <DetailCard>
                        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Host Summary</p>
                        <p className="mt-3 text-sm leading-6 text-neutral-600">
                          Runtime daemons act as the host layer. A single runtime can register multiple named Agents with isolated prompt constraints.
                        </p>
                      </DetailCard>
                        <DetailCard>
                          <div className="flex flex-col gap-2">
                            <Button onClick={() => handleOpenAgentCreateModal(selectedRuntimeWorkspace.id)} type="button" variant="secondary">
                              <Plus className="size-4" />
                              Create Agent
                            </Button>
                            <Button onClick={() => void handleOpenRuntimeConnectPanel()} type="button" variant="ghost">
                              <Sparkles className="size-4" />
                              Connect Runtime
                            </Button>
                            <Button
                              className="border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                              onClick={() => handleOpenRuntimeDeleteDialog(selectedRuntimeWorkspace.id)}
                              type="button"
                              variant="ghost"
                            >
                              <Trash2 className="size-4" />
                              Delete Runtime
                            </Button>
                            <Button onClick={() => handleOpenDetailPanel("runtime", selectedRuntimeWorkspace.id)} type="button" variant="ghost">
                              <FileText className="size-4" />
                              Open Inspector
                            </Button>
                          <Button onClick={() => void handleGenerateCommand()} type="button" variant="ghost">
                            <Sparkles className="size-4" />
                            Add Runtime
                          </Button>
                        </div>
                      </DetailCard>
                    </div>
                    <DetailCard accent="agent">
                      <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Attached Agents</p>
                      <div className="mt-3 grid gap-2">
                        {runtimeWorkspaceAgents.length === 0 ? (
                          <p className="text-sm text-neutral-500">No agents are attached to this runtime yet.</p>
                        ) : (
                          runtimeWorkspaceAgents.map((agent) => (
                            <div key={agent.id} className="rounded-xl border border-neutral-200 bg-white px-3 py-3">
                              <div className="flex items-start justify-between gap-3">
                                <button className="min-w-0 flex-1 text-left" onClick={() => handleOpenAgentWorkspace(agent.id)} type="button">
                                  <div className="flex items-center gap-3">
                                    <div className={`${getActorAvatarClass("agent")} size-10 text-emerald-700`}>
                                      <Bot className="size-4" />
                                    </div>
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-semibold text-neutral-950">{agent.name}</p>
                                      <p className="mt-1 font-mono text-[11px] text-neutral-500">
                                        {agent.implementation} / {agent.model}
                                      </p>
                                    </div>
                                  </div>
                                  <p className="mt-3 line-clamp-2 text-xs leading-5 text-neutral-600">{agent.description}</p>
                                </button>
                                <Button onClick={() => handleOpenAgentWorkspace(agent.id)} size="sm" type="button" variant="ghost">
                                  Chat
                                </Button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </DetailCard>
                  </div>
                ) : (
                  <EmptyState>No runtimes connected yet.</EmptyState>
                )}
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col">
              <div className="border-b border-neutral-200 px-5 py-5">
                <div className="flex items-center gap-2">
                  <Settings className="size-5 text-neutral-400" />
                  <h1 className="text-[28px] font-semibold tracking-[-0.04em]">Settings</h1>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-5">
                <div className="mx-auto grid max-w-3xl gap-4">
                  <DetailCard>
                    <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Account</p>
                    <input
                      ref={avatarInputRef}
                      accept="image/*"
                      className="hidden"
                      onChange={handleAvatarFileChange}
                      type="file"
                    />
                    <div className="mt-4 grid gap-3">
                      <div className="flex flex-col gap-4 rounded-[1rem] border border-neutral-200 bg-neutral-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-4">
                          <AvatarBadge imageUrl={accountAvatarImage} glyphId={accountAvatarGlyphId} name={accountName} paletteId={accountAvatarPaletteId} size="lg" />
                          <div>
                            <p className="text-sm font-medium text-neutral-900">Profile Avatar</p>
                            <p className="mt-1 text-xs text-neutral-500">Upload an image or choose a color swatch.</p>
                          </div>
                        </div>
                        <Button onClick={handleOpenAvatarPicker} type="button" variant="secondary">
                          Upload Avatar
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {avatarPalettes.map((palette) => (
                          <button
                            key={palette.id}
                            aria-label={`Use ${palette.id} avatar palette`}
                            className={`flex size-9 items-center justify-center rounded-full border transition ${
                              accountAvatarPaletteId === palette.id
                                ? "border-[var(--accent)] shadow-[0_0_0_2px_rgba(79,70,229,0.16)]"
                                : "border-neutral-200 hover:border-neutral-300"
                            }`}
                            onClick={() => {
                              setAccountAvatarPaletteId(palette.id);
                              setSettingsNotice("Avatar color updated locally.");
                            }}
                            style={{ backgroundColor: palette.background }}
                            type="button"
                          >
                            <span className="font-mono text-[10px] font-semibold" style={{ color: palette.foreground }}>
                              {getAvatarInitials(accountName)}
                            </span>
                          </button>
                        ))}
                      </div>
                      <div className="grid gap-2">
                        <p className="text-sm font-medium text-neutral-700">Avatar Style</p>
                        <div className="flex flex-wrap gap-2">
                          {avatarGlyphIds.map((glyphId) => (
                            <button
                              key={glyphId}
                              aria-label={`Use ${glyphId} avatar style`}
                              className={`rounded-[0.9rem] border p-1.5 transition ${
                                accountAvatarGlyphId === glyphId
                                  ? "border-[var(--accent)] bg-[var(--accent-soft)] shadow-[0_0_0_2px_rgba(79,70,229,0.10)]"
                                  : "border-neutral-200 bg-white hover:border-neutral-300"
                              }`}
                              onClick={() => {
                                setAccountAvatarGlyphId(glyphId);
                                setSettingsNotice("Avatar style updated locally.");
                              }}
                              type="button"
                            >
                              <AvatarBadge glyphId={glyphId} imageUrl={null} name={accountName} paletteId={accountAvatarPaletteId} size="sm" />
                            </button>
                          ))}
                        </div>
                      </div>
                      <label className="grid gap-1.5">
                        <span className="text-sm font-medium text-neutral-700">Name</span>
                        <Input value={accountName} onChange={(event) => setAccountName(event.target.value)} />
                      </label>
                      <label className="grid gap-1.5">
                        <span className="text-sm font-medium text-neutral-700">Email</span>
                        <Input disabled value={session.email} />
                      </label>
                      <div className="pt-1">
                        <Button onClick={handleSaveAccountProfile} type="button">
                          Save Profile
                        </Button>
                      </div>
                    </div>
                  </DetailCard>

                  <DetailCard>
                    <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Appearance</p>
                    <div className="mt-4 grid gap-3">
                      <div className="rounded-[1rem] border border-neutral-200 bg-neutral-50 p-4">
                        <p className="text-sm font-medium text-neutral-900">Theme Mode</p>
                        <p className="mt-1 text-xs text-neutral-500">
                          Pick the palette used across the workspace shell, kanban, and status bar.
                        </p>
                      </div>
                      <ThemeModeMenu
                        isOpen={isThemeModeMenuOpen}
                        mode={themeMode}
                        onChange={(nextMode) => {
                          setThemeMode(nextMode);
                          setIsThemeModeMenuOpen(false);
                          setSettingsNotice("Theme updated locally.");
                        }}
                        onToggle={() => setIsThemeModeMenuOpen((current) => !current)}
                      />
                    </div>
                  </DetailCard>

                  <DetailCard>
                    <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Change Password</p>
                    <div className="mt-4 grid gap-3">
                      <label className="grid gap-1.5">
                        <span className="text-sm font-medium text-neutral-700">Current Password</span>
                        <Input
                          type="password"
                          value={passwordDraft.currentPassword}
                          onChange={(event) =>
                            setPasswordDraft((current) => ({ ...current, currentPassword: event.target.value }))
                          }
                        />
                      </label>
                      <label className="grid gap-1.5">
                        <span className="text-sm font-medium text-neutral-700">New Password</span>
                        <Input
                          type="password"
                          value={passwordDraft.nextPassword}
                          onChange={(event) =>
                            setPasswordDraft((current) => ({ ...current, nextPassword: event.target.value }))
                          }
                        />
                      </label>
                      <label className="grid gap-1.5">
                        <span className="text-sm font-medium text-neutral-700">Confirm Password</span>
                        <Input
                          type="password"
                          value={passwordDraft.confirmPassword}
                          onChange={(event) =>
                            setPasswordDraft((current) => ({ ...current, confirmPassword: event.target.value }))
                          }
                        />
                      </label>
                      <div className="pt-1">
                        <Button onClick={handleChangePassword} type="button" variant="secondary">
                          Change Password
                        </Button>
                      </div>
                    </div>
                    {settingsNotice ? <p className="mt-4 text-sm text-neutral-500">{settingsNotice}</p> : null}
                  </DetailCard>
                </div>
              </div>
            </div>
          )}
        </section>

        {detailPanel.isOpen ? (
          <aside className="shell-panel shell-panel--detail flex h-full min-h-0 flex-col overflow-hidden rounded-none border-l-0">
            <div className="flex items-center justify-between gap-3 border-b border-neutral-200 bg-white px-5 py-4">
              <div>
                <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">Detail</p>
                <h2 className="mt-1 text-[26px] font-semibold tracking-[-0.04em]">{railModel?.title ?? getDetailTitle(detailPanel.kind)}</h2>
                {railModel ? <p className="mt-1 text-sm text-neutral-500">{railModel.subtitle}</p> : null}
              </div>
              <button
                className="panel-control flex size-10 items-center justify-center rounded-xl text-neutral-500"
                onClick={handleCloseDetailPanel}
                type="button"
              >
                <PanelRightClose className="size-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              <div className="space-y-4">
                {railModel ? (
                  <>
                    <InspectionHero model={railModel} />
                    {railModel.steps.length > 0 ? <InspectionTimeline steps={railModel.steps} /> : null}
                    {railModel.metrics.length > 0 ? <InspectionMetrics metrics={railModel.metrics} /> : null}
                  </>
                ) : null}

                {detailPanel.kind === "issue" && selectedIssue ? (
                  <DetailCard accent={getIssueStatusTone(selectedIssue.status)}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-lg font-semibold tracking-[-0.02em]">{selectedIssue.title}</p>
                      <StatusPill tone={getIssueStatusTone(selectedIssue.status)}>{formatIssueStatus(selectedIssue.status)}</StatusPill>
                    </div>
                    <div className="mt-4 grid gap-3 text-sm">
                      <DetailRow label="Source scope" value={selectedIssue.sourceChannelId ? "Current channel" : "Global board"} />
                      <DetailRow label="Created by" value={selectedIssue.creatorId} />
                      <DetailRow label="Assignee" value={selectedIssue.assigneeId ?? "Unassigned"} />
                    </div>
                    <div className="mt-4 grid gap-2">
                      <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Issue Description</p>
                      <p className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-3 text-sm leading-6 text-neutral-700">
                        {selectedIssue.description || "No issue description provided."}
                      </p>
                    </div>
                    <div className="mt-4 grid gap-2">
                      <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Source Messages</p>
                      {selectedIssueSourceMessages.length === 0 ? (
                        <p className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-3 text-sm text-neutral-500">
                          No source messages are linked in this view.
                        </p>
                      ) : (
                        selectedIssueSourceMessages.map((message) => (
                          <div key={message.id} className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-3">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-neutral-900">{displayMessageSenderName(message)}</span>
                              <span className="font-mono text-[11px] text-neutral-400">{formatTimestamp(message.createdAt)}</span>
                            </div>
                            {getMessageAttachments(message.attachments).length > 0 ? (
                              <div className="mt-3">
                                <MessageAttachmentGallery attachments={message.attachments} />
                              </div>
                            ) : null}
                            {message.content ? <p className="mt-2 select-text whitespace-pre-wrap break-words text-sm leading-6 text-neutral-700">{message.content}</p> : null}
                          </div>
                        ))
                      )}
                    </div>
                  </DetailCard>
                ) : null}

                {detailPanel.kind === "agent" && selectedAgent ? (
                  <DetailCard accent="agent">
                    <div className="flex items-center gap-3">
                      <div className={`${getActorAvatarClass("agent")} size-12 text-[var(--accent-strong)]`}>
                        <Bot className="size-5" />
                      </div>
                      <div>
                      <div className="flex items-center gap-2">
                        <p className="text-lg font-semibold tracking-[-0.02em]">{selectedAgent.name}</p>
                        <StatusDot tone="success" />
                      </div>
                        <p className="font-mono text-[11px] text-neutral-400">{selectedAgent.runtimeId}</p>
                        <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.16em] text-neutral-500">
                          {selectedAgent.implementation} / {selectedAgent.model} / {selectedAgent.reasoningEffort}
                        </p>
                      </div>
                    </div>
                    <p className="mt-4 font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Prompt Constraint</p>
                    <p className="mt-2 font-mono text-[13.5px] leading-7 text-neutral-800">{selectedAgent.description}</p>
                  </DetailCard>
                ) : null}

                {detailPanel.kind === "runtime" && selectedRuntime ? (
                  <>
                    <DetailCard>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-lg font-semibold tracking-[-0.02em]">{selectedRuntime.name}</p>
                        <p className="font-mono text-[11px] text-neutral-400">{selectedRuntime.id}</p>
                      </div>
                      <StatusPill tone={getRuntimeStatusTone(selectedRuntime.status)}>{selectedRuntime.status}</StatusPill>
                    </div>
                      <p className="mt-4 text-sm leading-6 text-neutral-600">
                      Runtime daemons are the host layer. Each runtime can create multiple Agents with explicit names and description-backed prompt boundaries.
                      </p>
                      <div className="mt-4">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            className="border-[var(--accent)] bg-[var(--accent)] text-white shadow-[0_12px_24px_rgba(79,70,229,0.2)] hover:bg-[var(--accent-strong)]"
                            onClick={() => {
                              handleOpenAgentCreateModal(selectedRuntime.id);
                            }}
                            type="button"
                            variant="secondary"
                          >
                            <Sparkles className="size-4" />
                            Create Agent
                          </Button>
                          <Button
                            className="border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                            onClick={() => handleOpenRuntimeDeleteDialog(selectedRuntime.id)}
                            type="button"
                            variant="secondary"
                          >
                            <Trash2 className="size-4" />
                            Delete Runtime
                          </Button>
                        </div>
                      </div>
                    </DetailCard>
                  </>
                ) : null}

                {!selectedIssue && !selectedAgent && !selectedRuntime ? (
                  <EmptyState>The selected item is no longer available.</EmptyState>
                ) : null}
              </div>
            </div>
          </aside>
        ) : null}
      </div>

      <footer
        className="flex h-[22px] shrink-0 items-center justify-between border-t px-2 text-[10.5px] leading-none"
        style={{
          borderColor: "color-mix(in srgb, var(--accent) 24%, var(--border))",
          background:
            "linear-gradient(180deg, color-mix(in srgb, var(--accent-soft) 82%, white 18%) 0%, color-mix(in srgb, var(--accent-soft) 56%, var(--panel) 44%) 100%)",
          color: "color-mix(in srgb, var(--accent-strong) 54%, var(--text-primary) 46%)"
        }}
      >
        <div className="flex min-w-0 items-center gap-3 overflow-hidden whitespace-nowrap">
          <div ref={statusWorkspaceMenuRef} className="relative">
            <button
              className="inline-flex h-[18px] items-center gap-1.5 rounded-[4px] px-1.5 font-medium transition hover:bg-[color:color-mix(in_srgb,var(--accent)_12%,transparent)]"
              onClick={() => setIsStatusWorkspaceMenuOpen((current) => !current)}
              type="button"
            >
              <GitBranch className="size-3" />
              <span>{selectedWorkspaceOption.label}</span>
            </button>
            {isStatusWorkspaceMenuOpen ? (
              <div className="absolute bottom-[calc(100%+6px)] left-0 z-30 w-56 rounded-[0.9rem] border border-neutral-200 bg-white p-1.5 text-neutral-900 shadow-[0_14px_30px_rgba(15,23,42,0.16)]">
                {workspaceOptions.map((option) => (
                  <button
                    key={option.id}
                    className={`flex w-full items-center justify-between rounded-[0.7rem] px-3 py-2 text-left text-xs transition ${
                      option.id === shellState.workspaceId
                        ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                        : "hover:bg-neutral-50"
                    }`}
                    onClick={() => {
                      handleSelectWorkspace(option.id);
                      setIsStatusWorkspaceMenuOpen(false);
                    }}
                    type="button"
                  >
                    <span className="font-medium">{option.label}</span>
                    {option.id === shellState.workspaceId ? <span className="font-mono text-[10px] uppercase tracking-[0.12em]">Current</span> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <span className="text-[color:color-mix(in_srgb,var(--accent)_34%,transparent)]">|</span>
          <span>{formatPrimaryViewLabel(shellState.primaryView)}</span>
          <span className="text-[color:color-mix(in_srgb,var(--accent)_34%,transparent)]">|</span>
          <span>{workspace?.issues.length ?? 0} issues</span>
          <span>{workspace?.runtimes.length ?? 0} runtimes</span>
        </div>
        <div className="flex items-center gap-3 whitespace-nowrap text-[color:color-mix(in_srgb,var(--text-secondary)_86%,var(--accent-strong)_14%)]">
          <span>{session.role}</span>
          <span>{session.email.split("@")[0]}</span>
        </div>
      </footer>

      {agentActionDialog ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[rgba(18,24,38,0.34)] px-4 py-8 backdrop-blur-[4px]">
          <div className="w-full max-w-2xl rounded-[1.75rem] border border-neutral-200 bg-white p-6 shadow-[var(--shadow-md)] lg:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Agent Control</p>
                <h2 className="mt-2 text-[32px] font-semibold tracking-[-0.05em] text-neutral-950">
                  {agentActionDialog.kind === "confirm" ? agentActionDialog.title : `Restart ${dialogAgent?.name ?? "Agent"}`}
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-500">
                  {agentActionDialog.kind === "confirm"
                    ? agentActionDialog.description
                    : "Choose which restart command to queue through the control-plane for this agent."}
                </p>
              </div>
              <button
                className="panel-control flex size-11 items-center justify-center rounded-xl text-neutral-950"
                onClick={handleCloseAgentActionDialog}
                type="button"
              >
                <X className="size-5" />
              </button>
            </div>

            {agentActionDialog.kind === "confirm" ? (
              <div className="mt-8 flex flex-wrap items-center justify-end gap-3">
                <Button onClick={handleCloseAgentActionDialog} type="button" variant="ghost">
                  Cancel
                </Button>
                <Button
                  className={agentActionDialog.confirmClassName}
                  onClick={handleConfirmAgentAction}
                  type="button"
                  variant={agentActionDialog.confirmClassName ? "secondary" : "primary"}
                >
                  {agentActionDialog.confirmLabel}
                </Button>
              </div>
            ) : (
              <div className="mt-6 grid gap-3">
                <button
                  className="rounded-[1.2rem] border border-neutral-200 bg-white px-4 py-4 text-left transition hover:border-neutral-300 hover:bg-neutral-50"
                  onClick={() => void handleRestartAgent("restart", dialogAgent ?? undefined)}
                  type="button"
                >
                  <p className="text-sm font-semibold text-neutral-950">Restart</p>
                  <p className="mt-1 text-sm leading-6 text-neutral-500">Keep the current session and memory, then bring the agent back up.</p>
                </button>
                <button
                  className="rounded-[1.2rem] border border-neutral-200 bg-white px-4 py-4 text-left transition hover:border-neutral-300 hover:bg-neutral-50"
                  onClick={() => void handleRestartAgent("reset_session", dialogAgent ?? undefined)}
                  type="button"
                >
                  <p className="text-sm font-semibold text-neutral-950">Reset Session, Keep Memory</p>
                  <p className="mt-1 text-sm leading-6 text-neutral-500">Drop the active session state, preserve memory, then restart.</p>
                </button>
                <button
                  className="rounded-[1.2rem] border border-rose-200 bg-rose-50 px-4 py-4 text-left transition hover:border-rose-300 hover:bg-rose-100"
                  onClick={() => void handleRestartAgent("full_reset", dialogAgent ?? undefined)}
                  type="button"
                >
                  <p className="text-sm font-semibold text-rose-700">Full Reset</p>
                  <p className="mt-1 text-sm leading-6 text-rose-600">Ask the daemon to wipe local agent session state and restart from a clean runtime workspace.</p>
                </button>

                <div className="mt-2 flex items-center justify-end">
                  <Button onClick={handleCloseAgentActionDialog} type="button" variant="ghost">
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {runtimeDeleteDialog ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[rgba(18,24,38,0.34)] px-4 py-8 backdrop-blur-[4px]">
          <div className="w-full max-w-2xl rounded-[1.75rem] border border-neutral-200 bg-white p-6 shadow-[var(--shadow-md)] lg:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Runtime Delete</p>
                <h2 className="mt-2 text-[32px] font-semibold tracking-[-0.05em] text-neutral-950">{runtimeDeleteDialog.title}</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-500">{runtimeDeleteDialog.description}</p>
              </div>
              <button
                className="panel-control flex size-11 items-center justify-center rounded-xl text-neutral-950"
                onClick={handleCloseRuntimeDeleteDialog}
                type="button"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-end gap-3">
              <Button onClick={handleCloseRuntimeDeleteDialog} type="button" variant="ghost">
                Cancel
              </Button>
              <Button
                className="border-rose-200 bg-rose-600 text-white hover:bg-rose-500"
                onClick={() => void handleConfirmRuntimeDelete()}
                type="button"
                variant="secondary"
              >
                {runtimeDeleteDialog.confirmLabel}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {isIssueCreateModalOpen ? (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-[rgba(18,24,38,0.34)] px-4 py-8 backdrop-blur-[4px]"
          onClick={handleCloseIssueCreateModal}
        >
          <div
            className="flex max-h-[calc(100vh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-[1.75rem] border border-neutral-200 bg-white shadow-[var(--shadow-md)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 px-6 pt-6 lg:px-8 lg:pt-8">
              <div>
                <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">New Issue</p>
                <h2 className="mt-2 text-[32px] font-semibold tracking-[-0.05em] text-neutral-950">Create an issue for the board</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-500">
                  Issues are the single source of truth for Kanban. Create a global issue, assign it later, and move it across lanes.
                </p>
              </div>
              <button
                className="panel-control flex size-11 items-center justify-center rounded-xl text-neutral-950"
                onClick={handleCloseIssueCreateModal}
                type="button"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 lg:px-8">
              <div className="grid gap-4">
                <label className="grid gap-1.5">
                  <span className="text-sm font-medium text-neutral-700">Title</span>
                  <Input
                    placeholder="Issue title"
                    value={issueCreateDraft.title}
                    onChange={(event) => setIssueCreateDraft((current) => ({ ...current, title: event.target.value }))}
                  />
                </label>

                <label className="grid gap-1.5">
                  <span className="text-sm font-medium text-neutral-700">Description</span>
                  <textarea
                    className="min-h-[180px] w-full resize-y rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm leading-6 text-neutral-950 outline-none placeholder:text-neutral-400 focus:border-[var(--accent)] focus-visible:ring-4 focus-visible:ring-[var(--accent-soft)]"
                    placeholder="Describe the issue, expected outcome, links, constraints, or acceptance notes."
                    value={issueCreateDraft.description}
                    onChange={(event) => setIssueCreateDraft((current) => ({ ...current, description: event.target.value }))}
                  />
                </label>

                <div className="grid gap-4 lg:grid-cols-2">
                  <label className="grid gap-1.5">
                    <span className="text-sm font-medium text-neutral-700">Status</span>
                    <select
                      className="h-11 w-full rounded-xl border border-neutral-300 bg-white px-4 text-sm text-neutral-950 outline-none focus:border-[var(--accent)]"
                      value={issueCreateDraft.status}
                      onChange={(event) =>
                        setIssueCreateDraft((current) => ({
                          ...current,
                          status: event.target.value as IssueDTO["status"]
                        }))
                      }
                    >
                      <option value="backlog">Backlog</option>
                      <option value="todo">Todo</option>
                      <option value="in_progress">In Progress</option>
                      <option value="in_review">In Review</option>
                      <option value="done">Done</option>
                    </select>
                  </label>

                  <label className="grid gap-1.5">
                    <span className="text-sm font-medium text-neutral-700">Priority</span>
                    <select
                      className="h-11 w-full rounded-xl border border-neutral-300 bg-white px-4 text-sm text-neutral-950 outline-none focus:border-[var(--accent)]"
                      value={issueCreateDraft.priority}
                      onChange={(event) =>
                        setIssueCreateDraft((current) => ({
                          ...current,
                          priority: event.target.value as IssueDTO["priority"]
                        }))
                      }
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </label>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <label className="grid gap-1.5">
                    <span className="text-sm font-medium text-neutral-700">Assignee</span>
                    <select
                      className="h-11 w-full rounded-xl border border-neutral-300 bg-white px-4 text-sm text-neutral-950 outline-none focus:border-[var(--accent)]"
                      value={issueCreateDraft.assigneeId ?? ""}
                      onChange={(event) =>
                        setIssueCreateDraft((current) => ({
                          ...current,
                          assigneeId: event.target.value || null
                        }))
                      }
                    >
                      <option value="">Unassigned</option>
                      {(workspace?.agents ?? []).map((agent) => (
                        <option key={agent.id} value={agent.id}>
                          {agent.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="grid gap-1.5">
                    <span className="text-sm font-medium text-neutral-700">Due Date</span>
                    <Input
                      type="date"
                      value={issueCreateDraft.dueDate}
                      onChange={(event) => setIssueCreateDraft((current) => ({ ...current, dueDate: event.target.value }))}
                    />
                  </label>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-neutral-200 bg-white px-6 py-4 lg:px-8">
              <Button onClick={handleCloseIssueCreateModal} type="button" variant="ghost">
                Cancel
              </Button>
              <Button
                className="border-[var(--accent)] bg-[var(--accent)] text-white hover:bg-[var(--accent-strong)]"
                disabled={!issueCreateDraft.title.trim()}
                onClick={() => void handleCreateIssue()}
                type="button"
                variant="secondary"
              >
                <Plus className="size-4" />
                Create Issue
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {isCreateAgentModalOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[rgba(18,24,38,0.34)] px-4 py-8 backdrop-blur-[4px]">
          <div className="w-full max-w-3xl rounded-[1.75rem] border border-neutral-200 bg-white p-6 shadow-[var(--shadow-md)] lg:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Create Agent</p>
                <h2 className="mt-2 text-[32px] font-semibold tracking-[-0.05em] text-neutral-950">Configure a child Agent for this runtime</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-500">
                  Keep the runtime selected, define the Agent role, then launch it without leaving the runtime workspace.
                </p>
              </div>
              <button
                className="panel-control flex size-11 items-center justify-center rounded-xl text-neutral-950"
                onClick={handleCloseAgentCreateModal}
                type="button"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="mt-6 grid gap-4">
              <div className="rounded-[1.2rem] border border-[rgba(79,70,229,0.14)] bg-[linear-gradient(180deg,rgba(79,70,229,0.06)_0%,rgba(255,255,255,0.98)_100%)] p-5">
                <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_220px] lg:items-end">
                  <div>
                    <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Runtime</p>
                    <p className="mt-2 text-sm leading-6 text-neutral-600">Choose which runtime host will own this Agent.</p>
                    <select
                      className="mt-3 h-11 w-full rounded-xl border border-neutral-300 bg-white px-4 text-sm text-neutral-950 outline-none focus:border-[var(--accent)]"
                      value={selectedRuntimeId ?? ""}
                      onChange={(event) => setSelectedRuntimeIdForPage(event.target.value)}
                    >
                      {(workspace?.runtimes ?? []).map((runtime) => (
                        <option key={runtime.id} value={runtime.id}>
                          {runtime.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="rounded-[1rem] border border-neutral-200 bg-white px-4 py-3">
                    <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">Implementation</p>
                    <p className="mt-2 text-sm font-semibold text-neutral-900">{selectedImplementationSummary.title}</p>
                    <p className="mt-2 text-sm leading-6 text-neutral-600">{selectedImplementationSummary.description}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-[1.2rem] border border-neutral-200 bg-white p-5 shadow-[0_10px_26px_rgba(15,23,42,0.06)]">
                <div className="grid gap-4">
                  <label className="grid gap-1.5">
                    <span className="text-sm font-medium text-neutral-700">Name</span>
                    <Input
                      placeholder="Agent name"
                      value={agentDraft.name}
                      onChange={(event) => setAgentDraft((current) => ({ ...current, name: event.target.value }))}
                    />
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-sm font-medium text-neutral-700">Description / Prompt Constraint</span>
                    <textarea
                      className="min-h-[170px] w-full resize-y rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm leading-6 text-neutral-950 outline-none placeholder:text-neutral-400 focus:border-[var(--accent)] focus-visible:ring-4 focus-visible:ring-[var(--accent-soft)]"
                      placeholder="Optional. Describe the Agent role, capabilities, and boundaries."
                      value={agentDraft.description}
                      onChange={(event) => setAgentDraft((current) => ({ ...current, description: event.target.value }))}
                    />
                  </label>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <label className="grid gap-1.5">
                      <span className="text-sm font-medium text-neutral-700">Execution Runtime</span>
                      <select
                        className="h-11 w-full rounded-xl border border-neutral-300 bg-white px-4 text-sm text-neutral-950 outline-none focus:border-[var(--accent)]"
                        value={agentDraft.implementation}
                        onChange={(event) =>
                          setAgentDraft((current) =>
                            createAgentDraftForImplementation(current, event.target.value as AgentDraft["implementation"])
                          )
                        }
                      >
                        {agentImplementationDefinitions.map((definition) => (
                          <option key={definition.id} value={definition.id}>
                            {definition.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1.5">
                      <span className="text-sm font-medium text-neutral-700">Model</span>
                      <select
                        className="h-11 w-full rounded-xl border border-neutral-300 bg-white px-4 text-sm text-neutral-950 outline-none focus:border-[var(--accent)]"
                        value={agentDraft.model}
                        onChange={(event) => setAgentDraft((current) => ({ ...current, model: event.target.value }))}
                      >
                        {selectedImplementation.models.map((model) => (
                          <option key={model} value={model}>
                            {model}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-end">
                    <div className="rounded-[1rem] border border-neutral-200 bg-[var(--panel-muted)] px-4 py-3">
                      <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">Selected Runtime</p>
                      <p className="mt-2 text-sm font-semibold text-neutral-900">
                        {workspace?.runtimes.find((runtime) => runtime.id === selectedRuntimeId)?.name ?? "Choose a runtime"}
                      </p>
                      <p className="mt-1 text-sm text-neutral-500">
                        Agents created here will inherit this runtime host and appear in the navigation tree immediately.
                      </p>
                    </div>
                    <label className="grid gap-1.5">
                      <span className="text-sm font-medium text-neutral-700">Reasoning Effort</span>
                      <select
                        className="h-11 w-full rounded-xl border border-neutral-300 bg-white px-4 text-sm text-neutral-950 outline-none focus:border-[var(--accent)]"
                        value={agentDraft.reasoningEffort}
                        onChange={(event) =>
                          setAgentDraft((current) => ({
                            ...current,
                            reasoningEffort: event.target.value as AgentDraft["reasoningEffort"]
                          }))
                        }
                      >
                        {(["low", "medium", "high"] as const).map((effort) => (
                          <option key={effort} value={effort}>
                            {effort[0]?.toUpperCase()}
                            {effort.slice(1)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-neutral-500">
                The new Agent will stay attached to the selected runtime and show up in the left navigation tree.
              </p>
              <div className="flex items-center gap-3">
                <Button onClick={handleCloseAgentCreateModal} type="button" variant="ghost">
                  Cancel
                </Button>
                <Button
                  className="border-[var(--accent)] bg-[var(--accent)] text-white shadow-[0_12px_24px_rgba(79,70,229,0.2)] hover:bg-[var(--accent-strong)]"
                  disabled={!selectedRuntimeId || !agentDraft.name.trim()}
                  onClick={handleCreateAgent}
                  type="button"
                  variant="secondary"
                >
                  <Sparkles className="size-4" />
                  Create Agent
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {runtimeConnectPanel?.isOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[rgba(18,24,38,0.34)] px-4 py-8 backdrop-blur-[4px]">
          <div className="w-full max-w-4xl rounded-[1.75rem] border border-neutral-200 bg-white p-6 shadow-[var(--shadow-md)] lg:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Connect Runtime</p>
                <h2 className="mt-2 text-[34px] font-semibold tracking-[-0.05em] text-neutral-950">Run this command on your machine</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-500">
                  Keep the daemon process running after launch. By default it will register with your machine hostname as the runtime name.
                </p>
              </div>
              <button
                className="panel-control flex size-11 items-center justify-center rounded-xl text-neutral-950"
                onClick={handleCloseRuntimeConnectPanel}
                type="button"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-2">
              {runtimeCommandModeOptions.map(({ id, label }) => (
                <button
                  key={id}
                  className={`rounded-xl border px-4 py-2 text-sm font-medium transition ${
                    runtimeConnectPanel.mode === id
                      ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                      : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 hover:bg-neutral-50"
                  }`}
                  onClick={() =>
                    setRuntimeConnectPanel((current) =>
                      current
                        ? {
                            ...current,
                            mode: id,
                            copied: false
                          }
                        : current
                    )
                  }
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-3 text-sm text-neutral-500">
              {runtimeConnectPanel.mode === "source"
                ? "Recommended for local development before the daemon package is published."
                : "Use a published package command when the daemon is distributed through a registry."}
            </p>

            <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_56px] lg:items-start">
              <code className="overflow-x-auto rounded-[1.15rem] border border-[rgba(79,70,229,0.24)] bg-[linear-gradient(180deg,#181d31_0%,#101427_100%)] px-5 py-4 font-mono text-[14px] leading-8 text-[#bef264]">
                {runtimeConnectCommand}
              </code>
              <button
                className="panel-control flex size-14 items-center justify-center rounded-xl text-neutral-950"
                onClick={handleCopyRuntimeCommand}
                type="button"
              >
                <Copy className="size-5" />
              </button>
            </div>

            <div className="mt-6 rounded-[1.15rem] border border-[var(--warning-border)] bg-[var(--warning-soft)] px-5 py-4">
              <div className="flex items-center gap-3">
                <span
                  className={`block h-3 w-3 rounded-full ${
                    connectedRuntime ? "bg-emerald-500 shadow-[0_0_0_6px_rgba(16,185,129,0.15)]" : "bg-amber-400 animate-pulse"
                  }`}
                />
                <p className="text-lg font-semibold text-neutral-950">
                  {connectedRuntime
                    ? getRuntimeConnectStatusText(connectedRuntime.name, runtimeConnectAutoCloseSeconds)
                    : "Waiting for runtime to connect..."}
                </p>
              </div>
              <p className="mt-2 text-sm text-neutral-700">
                {connectedRuntime
                  ? `Runtime ${connectedRuntime.name} registered successfully. You can close this panel and start creating agents on it.`
                  : "This page is polling the control plane for a newly registered runtime."}
              </p>
            </div>

            <div className="mt-6 flex items-center justify-between gap-4">
              <div className="text-sm text-neutral-500">
                {runtimeConnectPanel.copied ? "Command copied." : `Token expires at ${formatTimestamp(runtimeConnectPanel.expiresAt)}`}
              </div>
              <div className="flex items-center gap-3">
                <Button onClick={handleCloseRuntimeConnectPanel} type="button" variant="ghost">
                  Cancel
                </Button>
                <Button
                  className={connectedRuntime ? "" : "opacity-50"}
                  disabled={!connectedRuntime}
                  onClick={handleCloseRuntimeConnectPanel}
                  type="button"
                >
                  Done
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {isChannelCreateModalOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[rgba(18,24,38,0.34)] px-4 py-8 backdrop-blur-[4px]">
          <div className="w-full max-w-lg rounded-[1.75rem] border border-neutral-200 bg-white p-6 shadow-[var(--shadow-md)] lg:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Create Channel</p>
                <h2 className="mt-2 text-[28px] font-semibold tracking-[-0.04em] text-neutral-950">Start a new conversation</h2>
                <p className="mt-2 text-sm leading-6 text-neutral-500">
                  Channels group conversations with humans and agents. Give it a clear, memorable name.
                </p>
              </div>
              <button
                className="panel-control flex size-11 items-center justify-center rounded-xl text-neutral-950"
                onClick={handleCloseChannelCreateModal}
                type="button"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="mt-6 grid gap-4">
              <label className="grid gap-1.5">
                <span className="text-sm font-medium text-neutral-700">Channel Name</span>
                <Input
                  placeholder="e.g. # engineering, # releases, # incidents"
                  value={channelDraftName}
                  onChange={(event) => setChannelDraftName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && channelDraftName.trim()) {
                      event.preventDefault();
                      void handleCreateChannel();
                    }
                  }}
                />
              </label>

              <div className="flex items-center justify-end gap-3 pt-2">
                <Button onClick={handleCloseChannelCreateModal} type="button" variant="ghost">
                  Cancel
                </Button>
                <Button
                  className="border-[var(--accent)] bg-[var(--accent)] text-white shadow-[0_12px_24px_rgba(79,70,229,0.2)] hover:bg-[var(--accent-strong)]"
                  disabled={!channelDraftName.trim()}
                  onClick={() => void handleCreateChannel()}
                  type="button"
                >
                  <Sparkles className="size-4" />
                  Create Channel
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.2rem] border border-neutral-200 bg-[rgba(79,70,229,0.05)] px-4 py-4">
      <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">{label}</p>
      <p className="mt-2 font-mono text-[15px] font-semibold text-neutral-900">{value}</p>
    </div>
  );
}

function ThemeModeMenu({
  isOpen,
  mode,
  onChange,
  onToggle
}: {
  isOpen: boolean;
  mode: ThemeMode;
  onChange: (mode: ThemeMode) => void;
  onToggle: () => void;
}) {
  const activeTheme = getThemeModeOption(mode);

  return (
    <div className="relative">
      <button className="theme-mode-menu-trigger" onClick={onToggle} type="button">
        <div className="flex items-center gap-3">
          <span className="theme-mode-menu-trigger__swatch" style={{ background: activeTheme.accent }} />
          <div className="text-left">
            <p className="text-sm font-medium text-neutral-900">Theme mode</p>
            <p className="mt-0.5 text-xs text-neutral-500">{activeTheme.label}</p>
          </div>
        </div>
        <ChevronDown className={`size-4 text-neutral-400 transition ${isOpen ? "rotate-180" : ""}`} />
      </button>
      {isOpen ? (
        <div className="theme-mode-menu-panel">
          {themeModes.map((option) => (
            <button
              key={option.id}
              className={`theme-mode-option ${option.id === mode ? "theme-mode-option--active" : ""}`}
              onClick={() => onChange(option.id)}
              type="button"
            >
              <span
                className="theme-mode-switcher__swatch"
                style={{ background: option.accent, boxShadow: `0 0 0 6px ${option.surface}` }}
              />
              <span className="theme-mode-option__text">
                <span className="theme-mode-option__label">{option.label}</span>
                <span className="theme-mode-option__caption">Palette and atmosphere</span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SidebarSection({
  children,
  count,
  action,
  collapsed = false,
  onToggle,
  title
}: {
  children: ReactNode;
  count: number;
  action?: ReactNode;
  collapsed?: boolean;
  onToggle?: () => void;
  title: string;
}) {
  return (
    <section>
      <div className="mb-2.5 flex items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5" onClick={onToggle} type="button">
            {onToggle ? (
              collapsed ? <ChevronRight className="size-3.5 text-neutral-400" /> : <ChevronDown className="size-3.5 text-neutral-400" />
            ) : null}
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">{title}</p>
          </button>
          <span className="font-mono text-[11px] text-neutral-400">{count}</span>
        </div>
        {action}
      </div>
      {collapsed ? null : children}
    </section>
  );
}

function RuntimeAgentTree({
  activeAgentId,
  agents,
  expandedRuntimeIds,
  runtimes,
  selectedRuntimeId,
  onOpenAgentCreate,
  onSelectAgent,
  onSelectRuntime,
  onToggleRuntime
}: {
  activeAgentId: string | null;
  agents: WorkspaceBootstrapPayload["agents"];
  expandedRuntimeIds: Record<string, boolean>;
  runtimes: WorkspaceBootstrapPayload["runtimes"];
  selectedRuntimeId: string | null;
  onOpenAgentCreate: (runtimeId: string | null) => void;
  onSelectAgent: (agentId: string) => void;
  onSelectRuntime: (runtimeId: string) => void;
  onToggleRuntime: (runtimeId: string) => void;
}) {
  return (
    <div className="rounded-[1.2rem] border border-neutral-200 bg-white p-2.5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
      <div className="mb-2 flex items-center gap-2 px-2.5 py-1">
        <div className="flex size-7 items-center justify-center rounded-lg border border-[rgba(79,70,229,0.14)] bg-[var(--accent-soft)] text-[var(--accent-strong)]">
          <Bot className="size-3.5" />
        </div>
        <div>
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Agents</p>
          <p className="text-xs text-neutral-400">Runtime tree</p>
        </div>
      </div>

      <div className="grid gap-1.5">
        {runtimes.map((runtime) => {
          const runtimeAgents = agents.filter((agent) => agent.runtimeId === runtime.id);
          const isExpanded = expandedRuntimeIds[runtime.id] ?? false;
          const isSelected = selectedRuntimeId === runtime.id;

          return (
            <div key={runtime.id} className="rounded-[1rem] border border-transparent bg-[var(--panel-muted)]/70 p-1.5">
              <div
                className={`group flex items-center gap-2 rounded-[0.9rem] border px-2.5 py-2 transition ${
                  isSelected
                    ? "border-[rgba(79,70,229,0.22)] bg-[var(--accent-soft)]/70 shadow-[0_8px_20px_rgba(79,70,229,0.10)]"
                    : "border-transparent bg-transparent hover:border-neutral-200 hover:bg-white"
                }`}
              >
                <button
                  className="flex size-7 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition hover:bg-white hover:text-neutral-700"
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleRuntime(runtime.id);
                  }}
                  type="button"
                >
                  {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                </button>
                <button
                  className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
                  onClick={() => onSelectRuntime(runtime.id)}
                  type="button"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Monitor className="size-4 text-neutral-700" />
                      <p className="truncate text-sm font-semibold text-neutral-900">{runtime.name}</p>
                    </div>
                    <p className="mt-1 pl-6 font-mono text-[11px] text-neutral-400">{runtimeAgents.length} agents</p>
                  </div>
                  <StatusPill tone={getRuntimeStatusTone(runtime.status)}>{runtime.status}</StatusPill>
                </button>
                <button
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-700 opacity-0 transition group-hover:opacity-100"
                  onClick={() => onOpenAgentCreate(runtime.id)}
                  type="button"
                >
                  <Plus className="size-4" />
                </button>
              </div>

              {isExpanded ? (
                <div className="mt-1 ml-3.5 grid gap-1 border-l border-neutral-200 pl-5">
                  {runtimeAgents.length > 0 ? (
                    runtimeAgents.map((agent) => {
                      const isActive = activeAgentId === agent.id;
                      const implementationLabel = getAgentImplementationDefinition(agent.implementation).label;

                      return (
                        <button
                          key={agent.id}
                          className={`rounded-[0.9rem] border px-3 py-2.5 text-left transition ${
                            isActive
                              ? "border-[rgba(79,70,229,0.22)] bg-[rgba(79,70,229,0.08)] shadow-[0_8px_20px_rgba(79,70,229,0.08)]"
                              : "border-transparent bg-white/80 hover:border-neutral-200 hover:bg-white"
                          }`}
                          onClick={() => onSelectAgent(agent.id)}
                          type="button"
                        >
                          <div className="flex items-start gap-2.5">
                            <div className="mt-0.5 flex size-8 items-center justify-center rounded-lg border border-[rgba(79,70,229,0.16)] bg-white text-[var(--accent-strong)]">
                              <Bot className="size-3.5" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="truncate text-sm font-medium text-neutral-900">{agent.name}</p>
                                <StatusDot tone="success" />
                              </div>
                              <p className="mt-1 font-mono text-[11px] text-neutral-400">{implementationLabel}</p>
                            </div>
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    <div className="rounded-[0.9rem] border border-dashed border-neutral-200 bg-white/80 px-3 py-3 text-xs text-neutral-500">
                      No agents yet
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MenuAction({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      className="panel-control flex items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium text-neutral-800"
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function SidebarNavButton({
  active,
  icon: Icon,
  label,
  meta,
  onClick
}: {
  active: boolean;
  icon: typeof MessageSquareText;
  label: string;
  meta: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`flex items-center gap-3 rounded-[1rem] border px-3.5 py-3 text-left transition ${
        active
          ? "border-emerald-200 bg-[linear-gradient(180deg,rgba(16,185,129,0.10)_0%,rgba(255,255,255,1)_100%)] shadow-[0_10px_24px_rgba(16,185,129,0.10)]"
          : "border-transparent bg-white/60 hover:border-neutral-200 hover:bg-white"
      }`}
      onClick={onClick}
      type="button"
    >
      <div
        className={`flex size-10 items-center justify-center rounded-[0.9rem] border ${
          active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-neutral-200 bg-white text-neutral-700"
        }`}
      >
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-neutral-950">{label}</p>
        <p className="mt-1 text-xs text-neutral-500">{meta}</p>
      </div>
    </button>
  );
}

function ActivityBarButton({
  active,
  icon: Icon,
  label,
  onClick
}: {
  active: boolean;
  icon: typeof MessageSquareText;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className={`group relative flex size-11 items-center justify-center rounded-[1rem] border transition ${
        active
          ? "border-emerald-200 bg-emerald-50 text-emerald-700 shadow-[0_8px_20px_rgba(16,185,129,0.12)]"
          : "border-transparent bg-white/70 text-neutral-600 hover:border-neutral-200 hover:bg-white hover:text-neutral-900"
      }`}
      onClick={onClick}
      title={label}
      type="button"
    >
      {active ? <span className="absolute left-[-10px] h-6 w-[3px] rounded-full bg-emerald-500" /> : null}
      <Icon className="size-4" />
    </button>
  );
}

function TabButton({
  active,
  icon: Icon,
  label,
  onClick
}: {
  active: boolean;
  icon: typeof MessageSquareText;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`inline-flex h-10 items-center gap-2 rounded-lg border px-4 text-sm font-medium transition ${
        active
          ? "border-[var(--accent)] bg-[var(--accent)] text-white shadow-[0_10px_22px_rgba(79,70,229,0.18)]"
          : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 hover:bg-neutral-50"
      }`}
      onClick={onClick}
      type="button"
    >
      <Icon className="size-4" />
      {label}
    </button>
  );
}

function AgentModeTab({
  active,
  icon: Icon,
  label,
  onClick
}: {
  active: boolean;
  icon: typeof MessageSquareText;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`inline-flex h-11 items-center gap-2 border-x border-t px-4 text-sm font-semibold transition first:rounded-tl-[0.85rem] last:rounded-tr-[0.85rem] ${
        active
          ? "border-neutral-300 bg-white text-neutral-950"
          : "border-transparent bg-transparent text-neutral-500 hover:bg-white/70 hover:text-neutral-800"
      }`}
      onClick={onClick}
      type="button"
    >
      <Icon className="size-4" />
      {label}
    </button>
  );
}

function ComposerAttachmentGallery({
  attachments,
  onRemove
}: {
  attachments: ComposerAttachmentDraft[];
  onRemove: (attachmentId: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      {attachments.map((attachment) => (
        <div key={attachment.id} className="group relative overflow-hidden rounded-[1rem] border border-neutral-200 bg-[#f8fafc]">
          {attachment.kind === "image" && attachment.previewUrl ? (
            <img alt={attachment.name} className="h-16 w-16 object-cover" src={attachment.previewUrl} />
          ) : (
            <div className="flex h-16 w-32 items-center gap-2.5 px-3">
              <div className="flex size-8 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-700">
                <FileText className="size-3.5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-neutral-900">{attachment.name}</p>
                <p className="mt-1 text-xs text-neutral-500">{formatAttachmentSize(attachment.size)}</p>
              </div>
            </div>
          )}
          <button
            className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full border border-neutral-200 bg-white/95 text-neutral-600 opacity-0 shadow-sm transition group-hover:opacity-100"
            onClick={() => onRemove(attachment.id)}
            type="button"
          >
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

function AvatarBadge({
  name,
  imageUrl,
  glyphId,
  paletteId,
  size
}: {
  name: string;
  imageUrl: string | null;
  glyphId: AvatarGlyphId;
  paletteId: string;
  size: "sm" | "md" | "lg";
}) {
  const palette = getAvatarPaletteById(paletteId);
  const sizeClass =
    size === "lg"
      ? "size-16 rounded-[1.15rem] text-lg"
      : size === "md"
        ? "size-12 rounded-xl text-sm"
        : "size-9 rounded-lg text-xs";

  return imageUrl ? (
    <img alt={name} className={`${sizeClass} border border-neutral-200 object-cover shadow-[0_4px_12px_rgba(15,23,42,0.08)]`} src={imageUrl} />
  ) : (
    <div
      className={`${sizeClass} flex items-center justify-center overflow-hidden border border-neutral-200 shadow-[0_4px_12px_rgba(15,23,42,0.08)]`}
      style={{ backgroundColor: palette.background, color: palette.foreground }}
    >
      <AvatarGlyph glyphId={glyphId} />
    </div>
  );
}

function AvatarGlyph({ glyphId }: { glyphId: AvatarGlyphId }) {
  switch (glyphId) {
    case "sprout":
      return (
        <svg aria-hidden="true" className="h-[78%] w-[78%]" viewBox="0 0 64 64" fill="none">
          <circle cx="32" cy="35" r="15" fill="currentColor" opacity="0.18" />
          <path d="M22 26c1-6 6-10 10-10s9 4 10 10" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
          <circle cx="26" cy="33" r="2.6" fill="currentColor" />
          <circle cx="38" cy="33" r="2.6" fill="currentColor" />
          <path d="M27 41c3 3 7 3 10 0" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          <path d="M32 16c0-5 3-8 7-9-1 5-2 8-7 9Z" fill="currentColor" opacity="0.65" />
          <path d="M31 18c-1-4-4-7-8-8 1 5 3 8 8 8Z" fill="currentColor" opacity="0.45" />
        </svg>
      );
    case "comet":
      return (
        <svg aria-hidden="true" className="h-[78%] w-[78%]" viewBox="0 0 64 64" fill="none">
          <path d="M18 43c8-15 18-24 30-28-6 10-14 20-28 30" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
          <circle cx="40" cy="22" r="8" fill="currentColor" opacity="0.2" />
          <circle cx="38" cy="24" r="2.5" fill="currentColor" />
          <circle cx="46" cy="24" r="2.5" fill="currentColor" />
          <path d="M38 30c2 2 6 2 8 0" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      );
    case "pebble":
      return (
        <svg aria-hidden="true" className="h-[78%] w-[78%]" viewBox="0 0 64 64" fill="none">
          <rect x="16" y="16" width="32" height="32" rx="14" fill="currentColor" opacity="0.18" />
          <path d="M23 28c2-5 6-8 9-8 4 0 8 3 10 8" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
          <circle cx="27" cy="33" r="2.5" fill="currentColor" />
          <circle cx="39" cy="33" r="2.5" fill="currentColor" />
          <path d="M28 40c2.5 2 5.5 2.5 8 0" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      );
    case "orbit":
      return (
        <svg aria-hidden="true" className="h-[78%] w-[78%]" viewBox="0 0 64 64" fill="none">
          <circle cx="32" cy="32" r="10" fill="currentColor" opacity="0.18" />
          <path d="M16 32c0-10 7-18 16-18s16 8 16 18-7 18-16 18S16 42 16 32Z" stroke="currentColor" strokeWidth="3" opacity="0.45" />
          <circle cx="28" cy="31" r="2.5" fill="currentColor" />
          <circle cx="36" cy="31" r="2.5" fill="currentColor" />
          <path d="M28 38c2.5 2 5.5 2 8 0" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          <circle cx="47" cy="21" r="3" fill="currentColor" />
        </svg>
      );
    case "bloom":
      return (
        <svg aria-hidden="true" className="h-[78%] w-[78%]" viewBox="0 0 64 64" fill="none">
          <path d="M32 18c3-6 10-7 12 0-6 1-9 2-12 7-3-5-6-6-12-7 2-7 9-6 12 0Z" fill="currentColor" opacity="0.5" />
          <circle cx="32" cy="35" r="13" fill="currentColor" opacity="0.18" />
          <circle cx="27" cy="34" r="2.5" fill="currentColor" />
          <circle cx="37" cy="34" r="2.5" fill="currentColor" />
          <path d="M27 41c3 2 7 2 10 0" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      );
    default:
      return <span className="font-mono text-[0.8em] font-semibold">{getAvatarInitials("U")}</span>;
  }
}

function MessageAttachmentGallery({ attachments }: { attachments: MessageDTO["attachments"] }) {
  const safeAttachments = getMessageAttachments(attachments);

  return (
    <div className="flex flex-wrap gap-3">
      {safeAttachments.map((attachment) => (
        <div
          key={attachment.id}
          className="group block overflow-hidden rounded-[1rem] border border-neutral-200 bg-white transition hover:border-neutral-300 hover:shadow-[0_10px_24px_rgba(15,23,42,0.10)]"
        >
          {attachment.kind === "image" ? (
            <img alt={attachment.name} className="h-28 w-28 object-cover transition group-hover:scale-[1.02]" src={attachment.dataUrl} />
          ) : (
            <div className="flex h-28 w-48 items-center gap-3 px-4">
              <div className="flex size-11 items-center justify-center rounded-xl border border-neutral-200 bg-neutral-50 text-neutral-700">
                <FileText className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-neutral-900">{attachment.name}</p>
                <p className="mt-1 text-xs text-neutral-500">{formatAttachmentSize(attachment.size)}</p>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function IssueCard({ selected, issue, tone }: { selected: boolean; issue: IssueDTO; tone: StatusTone }) {
  const sourceCount = getIssueSourceMessageIds(issue).length;

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`font-medium ${selected ? "text-white" : "text-neutral-900"}`}>{issue.title}</p>
          <p className={`mt-1 font-mono text-[11px] ${selected ? "text-white/60" : "text-neutral-400"}`}>
            {issue.sourceChannelId ? `${sourceCount} ${sourceCount === 1 ? "message" : "messages"}` : "global issue"}
          </p>
        </div>
        <StatusPill tone={selected ? "neutral" : tone}>{formatIssueStatus(issue.status)}</StatusPill>
      </div>
      <p className={`mt-2 line-clamp-2 text-sm leading-6 ${selected ? "text-white/80" : "text-neutral-600"}`}>
        {issue.description || "Issue context is attached from the selected messages."}
      </p>
      <p className={`mt-3 text-sm ${selected ? "text-white/80" : "text-neutral-500"}`}>Created {formatTimestamp(issue.createdAt)}</p>
    </div>
  );
}

function DetailCard({
  accent = "neutral",
  children
}: {
  accent?: StatusTone | "agent";
  children: ReactNode;
}) {
  return <div className={getDetailCardClass(accent)}>{children}</div>;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1.5">
      <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">{label}</p>
      <p className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-700">{value}</p>
    </div>
  );
}

function InspectionHero({ model }: { model: InspectionRailModel }) {
  const tone = getActivityTone(model.activityState);

  return (
    <div className={getInspectionHeroClass(tone)}>
      <div className="inspection-hero__bar" />
      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">{model.heroLabel}</p>
            <p className="mt-2 text-[22px] font-semibold tracking-[-0.03em] text-neutral-950">{model.title}</p>
            <p className="mt-2 text-sm leading-6 text-neutral-600">{model.subtitle}</p>
          </div>
          <ActivitySignal state={model.activityState} />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <StatusPill tone={tone}>{model.activityLabel}</StatusPill>
          {model.activityState === "typing" ? <TypingDots /> : null}
          {model.activityState === "running" ? <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-700">live execution</span> : null}
        </div>
      </div>
    </div>
  );
}

function InspectionTimeline({ steps }: { steps: RailStep[] }) {
  return (
    <div className="rounded-[1.2rem] border border-neutral-200 bg-white p-4 shadow-[0_10px_26px_rgba(15,23,42,0.06)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">Execution Timeline</p>
        <span className="font-mono text-[11px] text-neutral-400">{steps.length} steps</span>
      </div>
      <div className="grid gap-3">
        {steps.map((step, index) => (
          <div key={`${step.title}-${index}`} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
            <div className="relative flex justify-center">
              <span className={getTimelineDotClass(step.state)} />
              {index < steps.length - 1 ? <span className={getTimelineConnectorClass(step.state)} /> : null}
            </div>
            <div className={getTimelineStepCardClass(step.state)}>
              <div className="flex items-center justify-between gap-3">
                <p className={`text-sm ${step.state === "running" ? "font-semibold text-neutral-950" : "font-medium text-neutral-900"}`}>
                  {step.title}
                </p>
                <StepStatePill state={step.state} />
              </div>
              <p className="mt-2 text-sm leading-6 text-neutral-500">{step.detail}</p>
              {step.state === "running" ? <div className="step-loader mt-3" /> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function InspectionMetrics({ metrics }: { metrics: RailMetric[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {metrics.map((metric) => (
        <div key={metric.label} className="rounded-[1rem] border border-neutral-200 bg-white px-3 py-3 shadow-[0_6px_14px_rgba(15,23,42,0.04)]">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">{metric.label}</p>
          <p className="mt-2 break-words font-mono text-[12px] leading-6 text-neutral-800">{metric.value}</p>
        </div>
      ))}
    </div>
  );
}

function ActivitySignal({ state }: { state: RailActivityState }) {
  const tone = getActivityTone(state);

  return (
    <div className={getActivitySignalClass(tone)}>
      <span className="agent-signal__core" />
      {state === "typing" ? <TypingDots compact /> : null}
      {state === "running" ? <span className="agent-signal__label">RUN</span> : null}
      {state === "reviewing" ? <span className="agent-signal__label">REV</span> : null}
    </div>
  );
}

function TypingDots({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`typing-dots ${compact ? "typing-dots--compact" : ""}`} aria-hidden="true">
      <span className="typing-dot" />
      <span className="typing-dot" />
      <span className="typing-dot" />
    </span>
  );
}

function StepStatePill({ state }: { state: RailStep["state"] }) {
  const tone: StatusTone = state === "done" ? "success" : state === "running" ? "warning" : "neutral";

  return <StatusPill tone={tone}>{state}</StatusPill>;
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[1.2rem] border border-dashed border-neutral-300 bg-[var(--panel-muted)] px-6 py-16 text-center text-sm text-neutral-500">
      {children}
    </div>
  );
}

function StatusPill({ children, tone }: { children: ReactNode; tone: StatusTone }) {
  return (
    <span className={getStatusPillClass(tone)}>
      <StatusDot tone={tone} />
      {children}
    </span>
  );
}

function StatusDot({ tone }: { tone: StatusTone }) {
  return <span className={getStatusDotClass(tone)} />;
}

function getActivityTone(state: RailActivityState): StatusTone {
  switch (state) {
    case "typing":
    case "running":
      return "warning";
    case "reviewing":
      return "success";
    default:
      return "neutral";
  }
}

function getDetailTitle(kind: DetailPanelState["kind"]) {
  switch (kind) {
    case "message":
      return "Message";
    case "issue":
      return "Issue";
    case "agent":
      return "Agent";
    case "runtime":
      return "Runtime";
    case "account":
      return "Account";
    default:
      return "Detail";
  }
}

function getIssueSourceMessageIds(issue: IssueDTO) {
  return issue.sourceChannelId ? [issue.sourceChannelId] : [];
}

function createBatchIssueTitle(messageCount: number) {
  return `Issue batch · ${messageCount} ${messageCount === 1 ? "message" : "messages"}`;
}

function formatIssueStatus(status: IssueDTO["status"]) {
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
      return status;
  }
}

function formatPrimaryViewLabel(view: ShellState["primaryView"]) {
  switch (view) {
    case "chat":
      return "Chats";
    case "kanban":
      return "Kanban";
    case "agents":
      return "Agents";
    case "runtimes":
      return "Runtimes";
    case "settings":
      return "Settings";
    default:
      return view;
  }
}

function formatAttachmentSize(size: number) {
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (size >= 1024) {
    return `${Math.round(size / 1024)} KB`;
  }

  return `${size} B`;
}

async function readFileAsDataUrl(file: File) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return `data:${file.type || "application/octet-stream"};base64,${btoa(binary)}`;
}

function formatTimestamp(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}
