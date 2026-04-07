import type {
  AgentWorkspaceFileContentDTO,
  AgentWorkspaceFileSummaryDTO,
  AuthSession,
  ChannelParticipantDTO,
  ChannelSummary,
  IssueActivityDTO,
  IssueDTO,
  MessageDTO,
  WorkspaceBootstrapPayload
} from "@workpilot/shared";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from "@workpilot/ui";
import {
  Bot,
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleDot,
  Copy,
  Eye,
  FileText,
  Files,
  Folder,
  FolderOpen,
  ClipboardList,
  KanbanSquare,
  CalendarDays,
  Loader,
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
  Layers,
  AtSign,
  UsersRound,
  UserRound
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
import { MessageContent } from "./lib/message-content";
import {
  buildRuntimeInstallCommand,
  createRuntimeConnectPanel,
  findNewlyConnectedRuntime,
  getRuntimeConnectStatusText
} from "./lib/runtime-connect";
import { getRuntimePresenceDetail } from "./lib/runtime-presence";
import { createTimestampLabels } from "./lib/timestamp";
import {
  createInitialShellState,
  getChannelDisplayName,
  getDefaultChannelId,
  reconcileInvalidActiveTarget,
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
  getPriorityColor,
  getStatusLaneConfig,
  getStatusLaneConfigs,
  getStatusPillClass,
  getTimelineConnectorClass,
  getTimelineDotClass,
  getTimelineStepCardClass,
  type ActorTone,
  type StatusLaneConfig,
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
type WorkspaceOption = {
  id: string;
  label: string;
  description: string;
};

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
type AgentRestartOption = "reset_session" | "reset_memory";
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
  const [isWorkspacesReady, setIsWorkspacesReady] = useState(false);
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
  const [workspaceOptions, setWorkspaceOptions] = useState<WorkspaceOption[]>([]);
  const [isWorkspaceSwitcherOpen, setIsWorkspaceSwitcherOpen] = useState(false);
  const [isWorkspaceCreateOpen, setIsWorkspaceCreateOpen] = useState(false);
  const [workspaceDraftName, setWorkspaceDraftName] = useState("");
  const [workspaceDraftDescription, setWorkspaceDraftDescription] = useState("");
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
  const [expandedAgentLogIds, setExpandedAgentLogIds] = useState<Record<string, boolean>>({});
  const [agentWorkspaceFiles, setAgentWorkspaceFiles] = useState<AgentWorkspaceFileSummaryDTO[]>([]);
  const [agentWorkspaceFileContents, setAgentWorkspaceFileContents] = useState<Record<string, AgentWorkspaceFileContentDTO>>({});
  const [selectedAgentWorkspaceFilePath, setSelectedAgentWorkspaceFilePath] = useState<string | null>(null);
  const [collapsedAgentWorkspaceFolders, setCollapsedAgentWorkspaceFolders] = useState<Record<string, boolean>>({});
  const [isAgentWorkspaceFilesLoading, setIsAgentWorkspaceFilesLoading] = useState(false);
  const [agentWorkspaceFilesError, setAgentWorkspaceFilesError] = useState<string | null>(null);
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
  const [settingsTab, setSettingsTab] = useState<"account" | "appearance" | "permissions">("account");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "admin">("member");
  const [workspaceInvitations, setWorkspaceInvitations] = useState<Array<{
    id: string;
    email: string;
    role: "owner" | "admin" | "member";
    invitedBy: string;
    token: string;
    expiresAt: string;
    acceptedAt: string | null;
    createdAt: string;
  }>>([]);
  const [channelDraftName, setChannelDraftName] = useState("");
  const [channelDraftDescription, setChannelDraftDescription] = useState("");
  const [channelDraftUserIds, setChannelDraftUserIds] = useState<string[]>([]);
  const [channelDraftAgentIds, setChannelDraftAgentIds] = useState<string[]>([]);
  const [channelParticipants, setChannelParticipants] = useState<ChannelParticipantDTO[]>([]);
  const [isChannelSettingsOpen, setIsChannelSettingsOpen] = useState(false);
  const [isChannelMembersOpen, setIsChannelMembersOpen] = useState(false);
  const [channelSettingsDraft, setChannelSettingsDraft] = useState({ name: "", description: "" });
  const [channelSettingsNotice, setChannelSettingsNotice] = useState<string | null>(null);
  const [mentionState, setMentionState] = useState<{
    query: string;
    start: number;
    end: number;
    selectedIndex: number;
  } | null>(null);
  const [organizationMembers, setOrganizationMembers] = useState<Array<{
    userId: string;
    email: string;
    role: "owner" | "admin" | "member";
  }>>([]);
  const [shellState, setShellState] = useState<ShellState>(() => createInitialShellState([], ""));
  const [agentWorkspace, setAgentWorkspace] = useState<AgentWorkspaceBrowserState>(() => createInitialAgentWorkspaceBrowserState(null));
  const [runtimeWorkspace, setRuntimeWorkspace] = useState<RuntimeWorkspaceBrowserState>(() =>
    createInitialRuntimeWorkspaceBrowserState(null)
  );
  const [selectedRuntimeIdForPage, setSelectedRuntimeIdForPage] = useState<string | null>(null);
  const [selectedIssueIdForPage, setSelectedIssueIdForPage] = useState<string | null>(null);
  const [selectedUserIdForPage, setSelectedUserIdForPage] = useState<string | null>(null);
  const [issueEditorDraft, setIssueEditorDraft] = useState(() => initialIssueCreateDraft());
  const [issueEditorBrief, setIssueEditorBrief] = useState("");
  const [issueCommentDraft, setIssueCommentDraft] = useState("");
  const [issueEditorNotice, setIssueEditorNotice] = useState<string | null>(null);
  const [messageSelection, setMessageSelection] = useState<MessageSelectionState>(initialMessageSelectionState);
  const [bulkIssueDescription, setBulkIssueDescription] = useState("");
  const [messageContextMenu, setMessageContextMenu] = useState<{ messageId: string; x: number; y: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const messageScrollerRef = useRef<HTMLDivElement | null>(null);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const issueAutosaveRequestIdRef = useRef(0);
  const workspaceSwitcherRef = useRef<HTMLDivElement | null>(null);
  const statusWorkspaceMenuRef = useRef<HTMLDivElement | null>(null);
  const previousMessageCountRef = useRef(0);
  const previousNonSettingsPathRef = useRef<string>("/");

  useEffect(() => {
    applyThemeModeToDocument(themeMode, document);
    persistThemeMode(window.localStorage, themeMode);
  }, [themeMode]);

  const pathname = usePathname();
  const navigate = useNavigate();

  useEffect(() => {
    const routerState = parseRouterState(pathname);

    if (!routerState.isLoginPage && !routerState.isRoot && routerState.primaryView !== "settings") {
      previousNonSettingsPathRef.current = pathname;
    }
  }, [pathname]);

  useEffect(() => {
    if (shellState.primaryView !== "settings") {
      return;
    }

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
        return;
      }

      event.preventDefault();
      handleCloseSettingsPage();
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [shellState.primaryView]);

  useEffect(() => {
    if (!session && pathname !== "/login") {
      return;
    }

    if (session && pathname === "/login") {
      navigate(workspaceOptions[0] ? `/workspace/${workspaceOptions[0].id}` : "/");
      return;
    }

    if (!workspace) return;

    const routerState = parseRouterState(pathname);

    if (routerState.isLoginPage && session) {
      navigate(workspaceOptions[0] ? `/workspace/${workspaceOptions[0].id}` : "/");
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

    if (routerState.activeUserId) {
      setSelectedUserIdForPage(routerState.activeUserId);
    }

    setSelectedIssueIdForPage(routerState.activeIssueId);

    if (routerState.primaryView === "issues") {
      setCenterView("issues");
    } else if (routerState.primaryView === "chat") {
      setCenterView("chat");
    }
  }, [pathname, session, workspace, workspaceOptions]);

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
      setWorkspaceOptions([]);
      setIsWorkspacesReady(false);
      return;
    }

    let cancelled = false;
    const userId = session.userId;

    async function loadWorkspaces() {
      const response = await api.getWorkspaces(userId);
      if (cancelled) {
        return;
      }

      const options = response.workspaces.map((workspace) => ({
        id: workspace.id,
        label: workspace.name,
        description: `/${workspace.slug}`
      }));

      setWorkspaceOptions(options);
      setIsWorkspacesReady(true);

      const fallbackWorkspaceId = options[0]?.id ?? "";
      const nextWorkspaceId =
        options.some((option) => option.id === shellState.workspaceId) ? shellState.workspaceId : fallbackWorkspaceId;

      setShellState((current) => ({
        ...current,
        workspaceId: nextWorkspaceId
      }));

      if (!nextWorkspaceId) {
        setWorkspace(null);
        navigate("/");
        return;
      }

      const routerState = parseRouterState(pathname);
      if (
        pathname === "/" ||
        !options.some((option) => option.id === routerState.workspaceId)
      ) {
        navigate(buildPath("/workspace/:workspaceId", { workspaceId: nextWorkspaceId }));
      }
    }

    void loadWorkspaces().catch((loadError) => {
      if (!cancelled) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load workspaces.");
        setIsWorkspacesReady(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [navigate, pathname, session, shellState.workspaceId]);

  useEffect(() => {
    if (!session || !shellState.workspaceId) {
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
    if (!workspace?.organization) {
      return;
    }

    let cancelled = false;
    const organizationId = workspace.organization.id;

    async function loadOrganizationMembers() {
      const response = await api.getOrganizationMembers(organizationId);
      if (!cancelled) {
        setOrganizationMembers(response.members);
      }
    }

    void loadOrganizationMembers().catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [workspace?.organization]);

  useEffect(() => {
    if (!workspace?.organization) {
      return;
    }

    let cancelled = false;
    const organizationId = workspace.organization.id;

    async function loadInvitations() {
      const response = await api.getWorkspaceInvitations(organizationId);
      if (!cancelled) {
        setWorkspaceInvitations(response.invitations);
      }
    }

    void loadInvitations().catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [workspace?.organization]);

  useEffect(() => {
    if (!workspace) {
      return;
    }

    const nextShellState = reconcileInvalidActiveTarget(shellState, workspace.channels, workspace.agents);

    if (nextShellState !== shellState) {
      setShellState(nextShellState);
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
    if (!session || !shellState.workspaceId) {
      return;
    }

    const organizationId = shellState.workspaceId;
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

      if (!runtimeConnectPanel?.isOpen || runtimeConnectPanel.connectedRuntimeId) {
        return;
      }

      const connectedRuntime = findNewlyConnectedRuntime(runtimeConnectPanel.baselineRuntimeIds, response.runtimes);

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
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [runtimeConnectPanel?.baselineRuntimeIds, runtimeConnectPanel?.connectedRuntimeId, runtimeConnectPanel?.isOpen, session, shellState.workspaceId]);

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

  const selectedWorkspaceOption = workspaceOptions.find((option) => option.id === shellState.workspaceId) ?? workspaceOptions[0] ?? {
    id: "",
    label: "Workspace",
    description: "/workspace"
  };
  const groupChannels = workspace?.channels.filter((channel) => channel.type === "group") ?? [];
  const activeAgent = shellState.activeTarget.kind === "agent" ? workspace?.agents.find((agent) => agent.id === shellState.activeTarget.id) ?? null : null;
  const resolvedActiveChannelId = resolveConversationChannelId(shellState.activeTarget, workspace);
  const activeChannelId =
    shellState.activeTarget.kind === "agent"
      ? agentDirectChannelIds[shellState.activeTarget.id] ?? resolvedActiveChannelId
      : resolvedActiveChannelId;
  const activeChannel = workspace?.channels.find((channel) => channel.id === activeChannelId) ?? null;
  const activeChannelParticipantCount = channelParticipants.length;
  const workspaceIssues = workspace?.issues ?? [];
  const activeMessages = (workspace?.messages.filter((message) => message.channelId === activeChannelId) ?? [])
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const activeIssues = workspaceIssues.filter((issue) => issue.sourceChannelId === activeChannelId);
  const activeConversationDescription =
    shellState.activeTarget.kind === "channel"
      ? activeChannel?.description?.trim() ?? ""
      : activeAgent?.description?.trim() ?? "";
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
  const selectedRuntimePresenceDetail = selectedRuntimeWorkspace ? getRuntimePresenceDetail(selectedRuntimeWorkspace) : null;
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
  const selectedAgentWorkspaceActivityBadge = selectedAgentWorkspace
    ? getAgentActivityBadge({
        implementation: selectedAgentWorkspace.implementation,
        activity: selectedAgentWorkspaceActivity
      })
    : null;
  const selectedAgentWorkspaceLogs = selectedAgentWorkspace
    ? workspace?.agentRunLogs.filter((log) => log.agentId === selectedAgentWorkspace.id) ?? []
    : [];
  const selectedAgentWorkspaceFile = selectedAgentWorkspace && selectedAgentWorkspaceFilePath
    ? agentWorkspaceFileContents[`${selectedAgentWorkspace.id}:${selectedAgentWorkspaceFilePath}`] ?? null
    : null;
  const agentWorkspaceTree = useMemo(
    () => buildAgentWorkspaceTree(agentWorkspaceFiles, collapsedAgentWorkspaceFolders),
    [agentWorkspaceFiles, collapsedAgentWorkspaceFolders]
  );
  const isAgentWorkspaceConversationMode =
    shellState.primaryView === "agents" && (agentWorkspace.mode === "chat" || agentWorkspace.mode === "logs");
  const isSelectedAgentWorkspaceStopped = selectedAgentWorkspaceLifecycleState === "stopped";
  const agentWorkspaceLayoutClassNames = getAgentWorkspaceLayoutClasses(agentWorkspace.mode);
  const detailContextMessages =
    isAgentWorkspaceConversationMode ? selectedAgentWorkspaceMessages : activeMessages;
  const currentChatChannelId =
    isAgentWorkspaceConversationMode
      ? selectedAgentWorkspaceChannelId || null
      : shellState.primaryView === "chat"
        ? activeChannelId || null
        : null;
  const currentChatMessages =
    currentChatChannelId ? workspace?.messages.filter((message) => message.channelId === currentChatChannelId) ?? [] : [];
  const currentChatTargetKind =
    isAgentWorkspaceConversationMode
      ? "agent"
      : shellState.primaryView === "chat"
        ? shellState.activeTarget.kind
        : "channel";
  const mentionCandidates = useMemo(() => {
    if (shellState.activeTarget.kind !== "channel") {
      return [];
    }

    const catalog: ChannelParticipantDTO[] = [
      ...channelParticipants,
      ...organizationMembers.map((member) => ({
        participantId: member.userId,
        participantType: "user" as const,
        displayName: member.email.split("@")[0] ?? member.email,
        email: member.email,
        role: member.role,
        agentStatus: null
      })),
      ...((workspace?.agents ?? []).map((agent) => ({
        participantId: agent.id,
        participantType: "agent" as const,
        displayName: agent.name,
        email: null,
        role: null,
        agentStatus: agent.status
      })))
    ];
    const deduped = new Map<string, ChannelParticipantDTO>();

    for (const participant of catalog) {
      deduped.set(`${participant.participantType}:${participant.participantId}`, participant);
    }

    const query = mentionState?.query.trim().toLowerCase() ?? "";

    return Array.from(deduped.values())
      .filter((participant) =>
        query.length === 0
          ? true
          : participant.displayName.toLowerCase().includes(query) || participant.email?.toLowerCase().includes(query)
      )
      .sort((left, right) => {
        if (left.participantType !== right.participantType) {
          return left.participantType === "agent" ? -1 : 1;
        }
        return left.displayName.localeCompare(right.displayName);
      })
      .slice(0, 8);
  }, [channelParticipants, mentionState?.query, organizationMembers, shellState.activeTarget.kind, workspace?.agents]);

  useEffect(() => {
    if (agentWorkspace.mode !== "memory" || !selectedAgentWorkspace) {
      return;
    }

    let cancelled = false;
    setIsAgentWorkspaceFilesLoading(true);
    setAgentWorkspaceFilesError(null);

    void api
      .listAgentWorkspaceFiles(selectedAgentWorkspace.id)
      .then((response) => {
        if (cancelled) {
          return;
        }

        setAgentWorkspaceFiles(response.files);
        setSelectedAgentWorkspaceFilePath((current) => {
          if (current && response.files.some((file) => file.path === current)) {
            return current;
          }

          return response.files[0]?.path ?? null;
        });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setAgentWorkspaceFiles([]);
        setSelectedAgentWorkspaceFilePath(null);
        setAgentWorkspaceFilesError(error instanceof Error ? error.message : "Failed to load workspace files.");
      })
      .finally(() => {
        if (!cancelled) {
          setIsAgentWorkspaceFilesLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [agentWorkspace.mode, selectedAgentWorkspace]);

  useEffect(() => {
    setCollapsedAgentWorkspaceFolders({});
  }, [selectedAgentWorkspace?.id]);

  useEffect(() => {
    if (agentWorkspace.mode !== "memory" || !selectedAgentWorkspace || !selectedAgentWorkspaceFilePath) {
      return;
    }

    const cacheKey = `${selectedAgentWorkspace.id}:${selectedAgentWorkspaceFilePath}`;
    if (agentWorkspaceFileContents[cacheKey]) {
      return;
    }

    let cancelled = false;
    void api
      .getAgentWorkspaceFileContent(selectedAgentWorkspace.id, selectedAgentWorkspaceFilePath)
      .then((response) => {
        if (cancelled) {
          return;
        }

        setAgentWorkspaceFileContents((current) => ({
          ...current,
          [cacheKey]: response.file
        }));
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setAgentWorkspaceFilesError(error instanceof Error ? error.message : "Failed to load workspace file content.");
      });

    return () => {
      cancelled = true;
    };
  }, [agentWorkspace.mode, selectedAgentWorkspace, selectedAgentWorkspaceFilePath, agentWorkspaceFileContents]);

  useEffect(() => {
    if (!selectedAgentWorkspaceFilePath) {
      return;
    }

    const parts = selectedAgentWorkspaceFilePath.split("/").slice(0, -1);
    if (parts.length === 0) {
      return;
    }

    setCollapsedAgentWorkspaceFolders((current) => {
      const next = { ...current };
      let changed = false;

      for (let index = 0; index < parts.length; index += 1) {
        const folderPath = parts.slice(0, index + 1).join("/");
        if (next[folderPath]) {
          next[folderPath] = false;
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [selectedAgentWorkspaceFilePath]);
  const currentChatAgentActivityStatus =
    currentChatTargetKind === "agent"
      ? isAgentWorkspaceConversationMode
        ? selectedAgentWorkspaceActivity?.status ?? null
        : activeAgentActivity?.status ?? null
      : null;

  useEffect(() => {
    if (shellState.activeTarget.kind !== "channel" || !activeChannelId) {
      setChannelParticipants([]);
      return;
    }

    let cancelled = false;

    async function loadChannelParticipants() {
      const response = await api.getChannelParticipants(activeChannelId);
      if (!cancelled) {
        setChannelParticipants(response.participants);
      }
    }

    void loadChannelParticipants().catch(() => {
      if (!cancelled) {
        setChannelParticipants([]);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [activeChannelId, shellState.activeTarget.kind]);

  useEffect(() => {
    setChannelSettingsDraft({
      name: activeChannel?.name ?? "",
      description: activeChannel?.description ?? ""
    });
    setChannelSettingsNotice(null);
    setMentionState(null);
  }, [activeChannel?.description, activeChannel?.id, activeChannel?.name]);

  useEffect(() => {
    const nextSelectedIssue = selectedIssueIdForPage ? workspaceIssues.find((issue) => issue.id === selectedIssueIdForPage) ?? null : null;

    if (!nextSelectedIssue) {
      setIssueEditorNotice(null);
      return;
    }

    setIssueEditorDraft({
      title: nextSelectedIssue.title,
      description: nextSelectedIssue.description,
      status: nextSelectedIssue.status,
      assigneeId: nextSelectedIssue.assigneeId,
      priority: nextSelectedIssue.priority,
      dueDate: nextSelectedIssue.dueDate ? nextSelectedIssue.dueDate.slice(0, 10) : ""
    });
    setIssueEditorBrief(formatIssueBrief(nextSelectedIssue.title, nextSelectedIssue.description));
    setIssueCommentDraft("");
    setIssueEditorNotice(null);
  }, [selectedIssueIdForPage, workspaceIssues]);

  useEffect(() => {
    const nextSelectedIssue = selectedIssueIdForPage ? workspaceIssues.find((issue) => issue.id === selectedIssueIdForPage) ?? null : null;

    if (!session || !nextSelectedIssue) {
      return;
    }

    const payload = buildIssueEditorUpdatePayload(nextSelectedIssue);

    if (!payload) {
      return;
    }

    const requestId = issueAutosaveRequestIdRef.current + 1;
    issueAutosaveRequestIdRef.current = requestId;

    const timer = window.setTimeout(() => {
      setIssueEditorNotice("Saving...");

      void api
        .updateIssue({
          issueId: nextSelectedIssue.id,
          actorId: session.userId,
          ...payload
        })
        .then(async (response) => {
          const activities = await api.getIssueActivities(nextSelectedIssue.id);

          if (issueAutosaveRequestIdRef.current !== requestId) {
            return;
          }

          setWorkspace((current) =>
            current
              ? {
                  ...current,
                  issues: current.issues.map((issue) => (issue.id === response.issue.id ? response.issue : issue)),
                  issueActivities: [
                    ...current.issueActivities.filter((activity) => activity.issueId !== nextSelectedIssue.id),
                    ...activities.activities
                  ]
                }
              : current
          );
          setIssueEditorNotice("Saved");
        })
        .catch(() => {
          if (issueAutosaveRequestIdRef.current === requestId) {
            setIssueEditorNotice("Save failed");
          }
        });
    }, 500);

    return () => {
      window.clearTimeout(timer);
    };
  }, [issueEditorBrief, issueEditorDraft, selectedIssueIdForPage, session, workspaceIssues]);

  const runtimeWorkspaceAgents = selectedRuntimeWorkspace
    ? workspace?.agents.filter((agent) => agent.runtimeId === selectedRuntimeWorkspace.id) ?? []
    : [];
  const selectedImplementation = getAgentImplementationDefinition(agentDraft.implementation);
  const selectedImplementationSummary = getPublicImplementationSummary(selectedImplementation);
  const selectedIssue = detailPanel.kind === "issue" ? workspaceIssues.find((issue) => issue.id === detailPanel.itemId) ?? null : null;
  const selectedIssueForPage = selectedIssueIdForPage ? workspaceIssues.find((issue) => issue.id === selectedIssueIdForPage) ?? null : null;
  const selectedIssueActivities = selectedIssueForPage
    ? (workspace?.issueActivities ?? []).filter((activity) => activity.issueId === selectedIssueForPage.id)
    : [];
  const selectedIssueRunLogs = selectedIssueForPage
    ? (workspace?.agentRunLogs ?? []).filter((log) => log.issueId === selectedIssueForPage.id).slice().reverse()
    : [];
  const issueEditorPreview = parseIssueBrief(issueEditorBrief);
  const selectedIssueTimeline = selectedIssueForPage
    ? [
        ...selectedIssueActivities.map((activity) => ({ kind: "activity" as const, createdAt: activity.createdAt, activity })),
        ...selectedIssueRunLogs.map((log) => ({ kind: "run" as const, createdAt: log.createdAt, log }))
      ].sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))
    : [];
  const selectedAgent =
    detailPanel.kind === "agent" ? workspace?.agents.find((agent) => agent.id === detailPanel.itemId) ?? null : null;
  const selectedRuntime =
    detailPanel.kind === "runtime"
      ? workspace?.runtimes.find((runtime) => runtime.id === detailPanel.itemId) ?? null
      : null;
  const selectedMessageRecords = activeMessages.filter((message) => messageSelection.selectedIds.includes(message.id));
  const selectedIssueSourceMessages =
    selectedIssue && selectedIssue.sourceChannelId === activeChannelId ? detailContextMessages : [];
  const selectedIssuePageSourceMessages = selectedIssueForPage?.sourceChannelId
    ? (workspace?.messages ?? []).filter((message) => message.channelId === selectedIssueForPage.sourceChannelId)
    : [];
  const selectedAgentForIssue =
    selectedIssue?.assigneeId ? workspace?.agents.find((agent) => agent.id === selectedIssue.assigneeId) ?? null : null;
  const selectedAgentForIssuePage = selectedIssueForPage?.assigneeId
    ? workspace?.agents.find((agent) => agent.id === selectedIssueForPage.assigneeId) ?? null
    : null;
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
    const channelId = currentChatChannelId;

    async function loadChatHistory() {
      const payload = await api.getChannelMessages(channelId, {
        organizationId: shellState.workspaceId ?? undefined
      });

      if (cancelled) {
        return;
      }

      setWorkspace((current) =>
        current
          ? {
              ...mergeChannelMessages(current, channelId, payload.messages),
              agentActivities: [
                ...current.agentActivities.filter(
                  (activity) => !payload.agentActivities.some((nextActivity) => nextActivity.agentId === activity.agentId)
                ),
                ...payload.agentActivities
              ],
              agentRunLogs: [
                ...current.agentRunLogs.filter((log) => !payload.agentRunLogs.some((nextLog) => nextLog.id === log.id)),
                ...payload.agentRunLogs
              ].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
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
    const channelId = currentChatChannelId;
    const cursor = currentChatMessages[currentChatMessages.length - 1]?.createdAt;

    async function pollCurrentChat() {
      const payload = await api.getChannelMessages(channelId, {
        after: cursor,
        organizationId: shellState.workspaceId ?? undefined
      });

      if (cancelled || (payload.messages.length === 0 && payload.agentActivities.length === 0 && payload.agentRunLogs.length === 0)) {
        return;
      }

      setWorkspace((current) =>
        current
          ? {
              ...mergeChannelMessages(current, channelId, [
                ...current.messages.filter((message) => message.channelId === channelId),
                ...payload.messages
              ]),
              agentActivities: [
                ...current.agentActivities.filter(
                  (activity) => !payload.agentActivities.some((nextActivity) => nextActivity.agentId === activity.agentId)
                ),
                ...payload.agentActivities
              ],
              agentRunLogs: [
                ...current.agentRunLogs.filter((log) => !payload.agentRunLogs.some((nextLog) => nextLog.id === log.id)),
                ...payload.agentRunLogs
              ].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
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
      isAgentWorkspaceConversationMode
        ? selectedAgentWorkspaceMessages.length
        : activeMessages.length;

    if (shouldAutoScrollToLatest({ previousCount, nextCount }) && messageScrollerRef.current) {
      messageScrollerRef.current.scrollTop = messageScrollerRef.current.scrollHeight;
    }

    previousMessageCountRef.current = nextCount;
  }, [activeMessages.length, isAgentWorkspaceConversationMode, selectedAgentWorkspaceMessages.length]);

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
      navigate("/");
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
      setAuthNotice("Signup request captured. Sign in to create or join a workspace.");
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
    if (!session || !shellState.workspaceId) {
      return;
    }

    setIsCreateAgentModalOpen(false);
    const command = await api.createRuntimeRegistrationCommand(
      shellState.workspaceId,
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
      option === "reset_session"
        ? `${agent.name} session reset requested. Memory will be kept.`
        : `${agent.name} memory reset requested. A fresh session will be started.`;
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
        name: channelDraftName,
        description: channelDraftDescription,
        actorId: session.userId,
        members: [
          ...channelDraftUserIds.map((participantId) => ({
            participantId,
            participantType: "user" as const
          })),
          ...channelDraftAgentIds.map((participantId) => ({
            participantId,
            participantType: "agent" as const
          }))
        ]
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
      setChannelDraftDescription("");
      setChannelDraftUserIds([]);
      setChannelDraftAgentIds([]);
      setDetailPanel(initialDetailPanelState);
    } catch {
      return;
    }
  }

  function handleOpenChannelCreateModal() {
    setIsChannelCreateModalOpen(true);
    setIsChannelCreateOpen(false);
  }

  function toggleChannelDraftUser(userId: string) {
    setChannelDraftUserIds((current) =>
      current.includes(userId) ? current.filter((entry) => entry !== userId) : [...current, userId]
    );
  }

  function toggleChannelDraftAgent(agentId: string) {
    setChannelDraftAgentIds((current) =>
      current.includes(agentId) ? current.filter((entry) => entry !== agentId) : [...current, agentId]
    );
  }

  function handleCloseChannelCreateModal() {
    setIsChannelCreateModalOpen(false);
    setChannelDraftName("");
    setChannelDraftDescription("");
    setChannelDraftUserIds([]);
    setChannelDraftAgentIds([]);
  }

  function handleLogout() {
    setSession(null);
    setIsSessionReady(true);
    setIsWorkspacesReady(false);
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
    setIsWorkspacesReady(false);
    setAgentDirectChannelIds({});
    setWorkspaceOptions([]);
    setIsChannelsCollapsed(false);
    setIsAgentsCollapsed(false);
    setChannelDraftName("");
    setChannelDraftDescription("");
    setChannelDraftUserIds([]);
    setChannelDraftAgentIds([]);
    setOrganizationMembers([]);
    setExpandedRuntimeIds({});
    setShellState(createInitialShellState([], ""));
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
    const workspaceId = shellState.workspaceId;

    if (!workspaceId) {
      return;
    }

    setIsAccountMenuOpen(false);
    setIsThemeModeMenuOpen(false);
    setIsCreateAgentModalOpen(false);
    setAgentActionNotice(null);
    setAgentActionDialog(null);
    setIsExplorerOpen(true);
    setShellState((current) => selectPrimaryView(current, "settings"));
    setDetailPanel(initialDetailPanelState);
    navigate(buildPath("/workspace/:workspaceId/settings", { workspaceId }));
  }

  function handleCloseSettingsPage() {
    const fallbackPath = shellState.workspaceId
      ? buildPath("/workspace/:workspaceId", { workspaceId: shellState.workspaceId })
      : "/";

    navigate(previousNonSettingsPathRef.current || fallbackPath);
  }

  function handleSelectWorkspace(workspaceId: string) {
    navigate(buildPath("/workspace/:workspaceId", { workspaceId }));
    setWorkspace(null);
    setOrganizationMembers([]);
    setWorkspaceInvitations([]);
    setShellState((current) => selectWorkspace(current, workspaceId, []));
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
    setChannelDraftDescription("");
    setChannelDraftUserIds([]);
    setChannelDraftAgentIds([]);
    setIsCreateAgentModalOpen(false);
    setSelectedUserIdForPage(null);
    setSelectedRuntimeIdForPage(null);
  }

  async function handleCreateWorkspaceOption() {
    if (!session) {
      return;
    }

    const label = workspaceDraftName.trim();

    if (!label) {
      return;
    }

    if (!/^[a-zA-Z0-9][a-zA-Z0-9 _-]*$/.test(label)) {
      return;
    }

    const result = await api.createWorkspace({
      userId: session.userId,
      name: label,
      description: workspaceDraftDescription.trim() || undefined
    });
    const nextOption = {
      id: result.workspace.id,
      label: result.workspace.name,
      description: `/${result.workspace.slug}`
    };

    setWorkspaceOptions((current) => [...current, nextOption]);
    setWorkspaceDraftName("");
    setWorkspaceDraftDescription("");
    setIsWorkspaceCreateOpen(false);
    setIsWorkspaceSwitcherOpen(false);
    handleSelectWorkspace(nextOption.id);
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

  function handleSelectPrimaryView(primaryView: "chat" | "kanban" | "agents" | "runtimes" | "users" | "settings") {
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

  function handleSelectActivityView(primaryView: "chat" | "kanban" | "agents" | "runtimes" | "users" | "settings") {
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

  function handleOpenUserPage(userId: string) {
    setSelectedUserIdForPage(userId);
    const path = buildPath("/workspace/:workspaceId/user/:userId", {
      workspaceId: shellState.workspaceId,
      userId
    });
    navigate(path);
    setShellState((current) => selectPrimaryView(current, "users"));
    setDetailPanel(initialDetailPanelState);
  }

  async function handleInviteMember() {
    if (!session || !workspace?.organization) return;
    const email = inviteEmail.trim();
    if (!email) return;

    try {
      const result = await api.createWorkspaceInvitation({
        organizationId: workspace.organization.id,
        email,
        role: inviteRole,
        invitedBy: session.userId
      });
      setWorkspaceInvitations((current) => [...current, result.invitation]);
      setInviteEmail("");
      setInviteRole("member");
    } catch {
      // silently ignore for now
    }
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

  function handleOpenIssueWorkspace(issueId: string) {
    if (!shellState.workspaceId) {
      return;
    }

    setSelectedIssueIdForPage(issueId);
    setCenterView("issues");
    setShellState((current) => selectPrimaryView(current, "kanban"));
    navigate(buildPath("/workspace/:workspaceId/issues/:issueId", { workspaceId: shellState.workspaceId, issueId }));
  }

  function handleCloseIssueWorkspace() {
    if (!shellState.workspaceId) {
      return;
    }

    setSelectedIssueIdForPage(null);
    setCenterView("issues");
    setShellState((current) => selectPrimaryView(current, "kanban"));
    navigate(buildPath("/workspace/:workspaceId/issues", { workspaceId: shellState.workspaceId }));
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
        actorId: session?.userId ?? "system",
        status: nextStatus
      });
      const activities = await api.getIssueActivities(issueId);

      setWorkspace((current) =>
        current
          ? {
              ...current,
              issues: current.issues.map((issue) => (issue.id === issueId ? response.issue : issue)),
              issueActivities: [
                ...current.issueActivities.filter((activity) => activity.issueId !== issueId),
                ...activities.activities
              ]
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

  function buildIssueEditorUpdatePayload(issue: IssueDTO) {
    const parsedBrief = parseIssueBrief(issueEditorBrief);

    if (!parsedBrief.title.trim()) {
      return null;
    }

    const normalizedCurrentDueDate = issue.dueDate ? issue.dueDate.slice(0, 10) : "";
    const normalizedDraftDueDate = issueEditorDraft.dueDate;

    const payload = {
      title: parsedBrief.title.trim() === issue.title ? undefined : parsedBrief.title.trim(),
      description: parsedBrief.description.trim() === issue.description ? undefined : parsedBrief.description.trim(),
      status: issueEditorDraft.status === issue.status ? undefined : issueEditorDraft.status,
      assigneeId: issueEditorDraft.assigneeId === issue.assigneeId ? undefined : issueEditorDraft.assigneeId,
      priority: issueEditorDraft.priority === issue.priority ? undefined : issueEditorDraft.priority,
      dueDate:
        normalizedDraftDueDate === normalizedCurrentDueDate
          ? undefined
          : normalizedDraftDueDate
            ? new Date(normalizedDraftDueDate).toISOString()
            : null,
      project: undefined as string | null | undefined
    };

    const hasChanges = Object.values(payload).some((value) => value !== undefined);
    return hasChanges ? payload : null;
  }

  async function handleCreateIssueComment() {
    if (!session || !selectedIssueForPage || !issueCommentDraft.trim()) {
      return;
    }

    const response = await api.createIssueComment({
      issueId: selectedIssueForPage.id,
      actorId: session.userId,
      actorType: "user",
      message: issueCommentDraft.trim()
    });

    setWorkspace((current) =>
      current
        ? {
            ...current,
            issueActivities: [...current.issueActivities, response.activity],
            issues: current.issues.map((issue) =>
              issue.id === selectedIssueForPage.id
                ? {
                    ...issue,
                    updatedAt: response.activity.createdAt
                  }
                : issue
            )
          }
        : current
    );
    setIssueCommentDraft("");
  }

  async function handleDeleteIssue(issueId: string) {
    if (!session) {
      return;
    }

    const confirmed = window.confirm("Delete this issue?");
    if (!confirmed) {
      return;
    }

    await api.deleteIssue({
      issueId,
      actorId: session.userId
    });

    setWorkspace((current) =>
      current
        ? {
            ...current,
            issues: current.issues.filter((issue) => issue.id !== issueId),
            issueActivities: current.issueActivities.filter((activity) => activity.issueId !== issueId),
            agentRunLogs: current.agentRunLogs.filter((log) => log.issueId !== issueId)
          }
        : current
    );

    if (selectedIssueIdForPage === issueId) {
      handleCloseIssueWorkspace();
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

  function syncMentionState(nextValue: string, caret: number | null) {
    if (shellState.activeTarget.kind !== "channel" || caret === null) {
      setMentionState(null);
      return;
    }

    const nextMention = getMentionDraft(nextValue, caret);
    setMentionState((current) =>
      nextMention
        ? {
            ...nextMention,
            selectedIndex: current && current.query === nextMention.query ? current.selectedIndex : 0
          }
        : null
    );
  }

  function handleComposerChange(value: string, caret: number | null) {
    setComposerValue(value);
    syncMentionState(value, caret);
  }

  function applyMentionSelection(participant: ChannelParticipantDTO) {
    if (!mentionState) {
      return;
    }

    const nextValue = `${composerValue.slice(0, mentionState.start)}@${participant.displayName} ${composerValue.slice(mentionState.end)}`;
    const nextCaret = mentionState.start + participant.displayName.length + 2;

    setComposerValue(nextValue);
    setMentionState(null);

    window.requestAnimationFrame(() => {
      composerTextareaRef.current?.focus();
      composerTextareaRef.current?.setSelectionRange(nextCaret, nextCaret);
    });
  }

  async function handleSaveChannelSettings() {
    if (!activeChannel) {
      return;
    }

    try {
      const response = await api.updateChannel({
        channelId: activeChannel.id,
        name: channelSettingsDraft.name,
        description: channelSettingsDraft.description
      });

      setWorkspace((current) =>
        current
          ? {
              ...current,
              channels: current.channels.map((channel) =>
                channel.id === response.channel.id ? { ...channel, ...response.channel } : channel
              )
            }
          : current
      );
      setChannelSettingsNotice("Saved");
      window.setTimeout(() => {
        setIsChannelSettingsOpen(false);
        setChannelSettingsNotice(null);
      }, 600);
    } catch (saveError) {
      setChannelSettingsNotice(saveError instanceof Error ? saveError.message : "Unable to save channel.");
    }
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionState && mentionCandidates.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setMentionState((current) =>
          current
            ? { ...current, selectedIndex: (current.selectedIndex + 1) % mentionCandidates.length }
            : current
        );
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setMentionState((current) =>
          current
            ? { ...current, selectedIndex: (current.selectedIndex - 1 + mentionCandidates.length) % mentionCandidates.length }
            : current
        );
        return;
      }

      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        applyMentionSelection(mentionCandidates[mentionState.selectedIndex] ?? mentionCandidates[0]!);
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        setMentionState(null);
        return;
      }
    }

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
          Loading app...
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
              <Badge className="w-fit border-sky-200 bg-sky-50 text-sky-700">Workspace Sign In</Badge>
              <CardTitle className="text-3xl font-semibold tracking-[-0.03em]">Sign in to WorkPilot</CardTitle>
              <CardDescription>
                Sign in to load your workspaces. If you do not have one yet, WorkPilot will ask you to create your first workspace.
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
                    {isSubmitting && activeAuthAction === "login" ? "Signing in..." : "Enter WorkPilot"}
                  </Button>
                  <button
                    className="text-sm font-medium text-neutral-500 transition hover:text-[var(--accent-strong)]"
                    disabled={isSubmitting}
                    onClick={(event) => {
                      event.preventDefault();
                      setCredentials(initialCredentials);
                      setError(null);
                      setAuthNotice("Default credentials restored.");
                      setActiveAuthAction("login");
                    }}
                    type="button"
                  >
                    Restore default credentials
                  </button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  if (!isWorkspacesReady) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#ffffff_0%,_#eef4ff_58%,_#e2e8f0_100%)] px-6 py-10 text-neutral-950">
        <div className="rounded-[1.5rem] border border-neutral-200 bg-white/85 px-6 py-5 text-sm font-medium text-neutral-600 shadow-[0_12px_40px_rgba(15,23,42,0.08)] backdrop-blur-sm">
          Loading workspaces...
        </div>
      </main>
    );
  }

  if (workspaceOptions.length === 0) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#ffffff_0%,_#eef4ff_58%,_#e2e8f0_100%)] px-6 py-10 text-neutral-950">
        <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-3xl items-center justify-center">
          <Card className="w-full border-neutral-200 bg-white">
            <CardHeader>
              <Badge className="w-fit border-amber-200 bg-amber-50 text-amber-700">Workspace Required</Badge>
              <CardTitle className="text-3xl font-semibold tracking-[-0.03em]">Create your first workspace</CardTitle>
              <CardDescription>
                Your account does not have any workspaces yet. Create one before entering the main app.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div>
                <Input
                  autoFocus
                  onChange={(event) => setWorkspaceDraftName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleCreateWorkspaceOption();
                    }
                  }}
                  placeholder="Workspace name"
                  value={workspaceDraftName}
                />
                {workspaceDraftName.trim() && !/^[a-zA-Z0-9][a-zA-Z0-9 _-]*$/.test(workspaceDraftName.trim()) ? (
                  <p className="mt-1.5 text-sm text-red-500">Only letters, digits, spaces, hyphens, and underscores allowed. Must start with a letter or digit.</p>
                ) : null}
              </div>
              <Input
                onChange={(event) => setWorkspaceDraftDescription(event.target.value)}
                placeholder="Description (optional)"
                value={workspaceDraftDescription}
              />
              <div className="flex justify-end">
                <Button disabled={!workspaceDraftName.trim() || !/^[a-zA-Z0-9][a-zA-Z0-9 _-]*$/.test(workspaceDraftName.trim())} onClick={() => void handleCreateWorkspaceOption()} type="button">
                  Create Workspace
                </Button>
              </div>
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
                      {workspaceDraftName.trim() && !/^[a-zA-Z0-9][a-zA-Z0-9 _-]*$/.test(workspaceDraftName.trim()) ? (
                        <p className="mt-1.5 text-xs text-red-500">Only letters, digits, spaces, hyphens, and underscores.</p>
                      ) : null}
                      <Input
                        className="mt-2 h-10"
                        onChange={(event) => setWorkspaceDraftDescription(event.target.value)}
                        placeholder="Description (optional)"
                        value={workspaceDraftDescription}
                      />
                      <div className="mt-3 flex items-center justify-end gap-2">
                        <Button
                          onClick={() => {
                            setIsWorkspaceCreateOpen(false);
                            setWorkspaceDraftName("");
                            setWorkspaceDraftDescription("");
                          }}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          Cancel
                        </Button>
                        <Button disabled={!workspaceDraftName.trim() || !/^[a-zA-Z0-9][a-zA-Z0-9 _-]*$/.test(workspaceDraftName.trim())} onClick={handleCreateWorkspaceOption} size="sm" type="button">
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
            <ActivityBarButton
              active={shellState.primaryView === "users"}
              icon={UsersRound}
              label="Members"
              onClick={() => handleSelectActivityView("users")}
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

{shellState.primaryView !== "settings" && (
          <div className="border-b border-neutral-200 px-4 py-3">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
              {shellState.primaryView === "chat"
                ? "Chats"
                : shellState.primaryView === "kanban"
                  ? "Workspace"
                : shellState.primaryView === "agents"
                  ? "Agents"
                : "Runtimes"}
            </p>
            <p className="mt-1 text-xs text-neutral-400">
              {shellState.primaryView === "chat"
                ? `${groupChannels.length} conversations`
                : shellState.primaryView === "kanban"
                  ? `${workspaceIssues.length} issues`
                : shellState.primaryView === "agents"
                  ? `${workspace?.agents.length ?? 0} available agents`
                  : `${workspace?.runtimes.length ?? 0} connected hosts`}
            </p>
          </div>
          )}

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

            {shellState.primaryView === "users" ? (
              <div className="space-y-4">
                <div className="mb-3 flex items-center justify-between gap-3 px-1">
                  <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">Members</p>
                </div>
                <div className="grid gap-1.5">
                  {organizationMembers.map((member) => {
                    const isSelected = selectedUserIdForPage === member.userId;
                    return (
                      <button
                        key={member.userId}
                        className={`rounded-[0.95rem] border px-3 py-3 text-left transition ${
                          isSelected
                            ? "border-blue-200 bg-blue-50/80"
                            : "border-transparent bg-white/70 hover:border-neutral-200 hover:bg-white"
                        }`}
                        onClick={() => handleOpenUserPage(member.userId)}
                        type="button"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-neutral-900">{member.email.split("@")[0]}</p>
                            <p className="mt-1 truncate font-mono text-[11px] text-neutral-500">{member.userId}</p>
                          </div>
                          <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600">{member.role}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}


          </div>
        </aside>
        ) : null}

        <section className="shell-panel shell-panel--main flex h-full min-h-0 flex-col overflow-hidden rounded-none">
          {shellState.primaryView === "chat" ? (
            <div className={`${chatPanelLayoutClassNames.shell} relative`}>
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
                        <h1 className="truncate text-[24px] font-semibold tracking-[-0.04em] lg:text-[26px]">
                          {formatConversationTitle({
                            kind: shellState.activeTarget.kind,
                            name:
                              shellState.activeTarget.kind === "channel"
                                ? getChannelDisplayName(activeChannel ?? { id: "", type: "group", name: "all" })
                                : activeAgent?.name ?? "Agent"
                          })}
                          {activeConversationDescription ? (
                            <span className="ml-3 align-middle text-[13px] font-medium tracking-normal text-neutral-500 lg:text-[14px]">
                              {activeConversationDescription}
                            </span>
                          ) : null}
                        </h1>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2.5">
                      {shellState.activeTarget.kind === "channel" ? (
                        <>
                          <button
                            className={`inline-flex items-center gap-2 rounded-[0.95rem] px-3 py-2 text-sm font-medium ring-1 transition ${
                              isChannelSettingsOpen
                                ? "bg-[var(--accent-soft)] text-[var(--accent-strong)] ring-[color:color-mix(in_srgb,var(--accent)_26%,white)]"
                                : "bg-white/75 text-neutral-700 ring-neutral-200/80 hover:bg-white hover:ring-neutral-300"
                            }`}
                            onClick={() => {
                              setIsChannelMembersOpen(false);
                              setIsChannelSettingsOpen((current) => !current);
                            }}
                            type="button"
                          >
                            <SlidersHorizontal className="size-4" />
                            Channel
                          </button>
                          <button
                            className={`inline-flex items-center gap-2 rounded-[0.95rem] px-3 py-2 text-sm font-medium ring-1 transition ${
                              isChannelMembersOpen
                                ? "bg-[var(--accent-soft)] text-[var(--accent-strong)] ring-[color:color-mix(in_srgb,var(--accent)_26%,white)]"
                                : "bg-white/75 text-neutral-700 ring-neutral-200/80 hover:bg-white hover:ring-neutral-300"
                            }`}
                            onClick={() => {
                              setIsChannelSettingsOpen(false);
                              setIsChannelMembersOpen((current) => !current);
                            }}
                            type="button"
                          >
                            <UsersRound className="size-4" />
                            {activeChannelParticipantCount}
                          </button>
                        </>
                      ) : null}
                      <span className="rounded-full bg-white/72 px-2.5 py-1 font-mono text-[11px] text-neutral-500 ring-1 ring-neutral-200/80">
                        {activeMessages.length} messages
                      </span>
                      <span className="rounded-full bg-white/72 px-2.5 py-1 font-mono text-[11px] text-neutral-500 ring-1 ring-neutral-200/80">
                        {activeIssues.length} issues
                      </span>
                      {activeAgent ? (
                        <span className="rounded-full bg-white/72 px-2.5 py-1 font-mono text-[11px] text-neutral-500 ring-1 ring-neutral-200/80">
                          {activeAgentActivityBadge?.label ?? (activeAgentLifecycleState === "running" ? "running" : "stopped")}
                        </span>
                      ) : null}
                      {activeAgent ? (
                        <>
                          <Button
                            onClick={() => handleOpenLifecycleDialog(activeAgentLifecycleState === "running" ? "stopped" : "running")}
                            size="sm"
                            type="button"
                            className="bg-white/76 ring-1 ring-neutral-200/80 hover:bg-white hover:ring-neutral-300"
                            variant="ghost"
                          >
                            {activeAgentLifecycleState === "running" ? "Stop" : "Start"}
                          </Button>
                          <Button onClick={() => handleOpenRestartDialog()} size="sm" type="button" className="bg-white/76 ring-1 ring-neutral-200/80 hover:bg-white hover:ring-neutral-300" variant="ghost">
                            Reset
                          </Button>
                          <Button
                            className="bg-rose-50/70 text-rose-700 ring-1 ring-rose-200/80 hover:bg-rose-50 hover:text-rose-800 hover:ring-rose-300"
                            onClick={() => handleOpenDeleteDialog()}
                            size="sm"
                            type="button"
                            variant="ghost"
                          >
                            Delete
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </div>
                  {agentActionNotice ? (
                    <div className="mt-4 rounded-[1rem] bg-[rgba(255,241,248,0.92)] px-3 py-3 text-sm text-neutral-700 ring-1 ring-[rgba(244,114,182,0.18)] shadow-[0_8px_24px_rgba(244,114,182,0.08)]">
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
                  <div className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-[1.3rem] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(246,248,247,0.96))] ring-1 ring-neutral-200/80 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
                    {messageSelection.isMultiSelectMode ? (
                      <div className="mx-4 mt-4 rounded-[1rem] border border-[var(--warning-border)] bg-[var(--warning-soft)] px-3 py-3 shadow-[0_8px_18px_rgba(245,158,11,0.14)]">
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

                    <div ref={messageScrollerRef} className={`${chatPanelLayoutClassNames.scroller} px-4 py-4`}>
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
                                    <div className={`${getActorAvatarClass(tone)} mt-0.5 size-12`}>
                                      <Bot className="size-[18px]" />
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
                                      size="md"
                                    />
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                      <span className="text-[13px] font-semibold text-neutral-900">
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
                                      <p className="mt-1.5 select-text whitespace-pre-wrap break-words leading-6 text-[13px] text-neutral-700">
                                        <MessageContent
                                          content={message.content}
                                          agents={workspace?.agents ?? []}
                                          onAgentClick={(agentId) => {
                                            handleOpenAgentWorkspace(agentId);
                                          }}
                                          onUserClick={(userId) => {
                                            handleOpenUserPage(userId);
                                          }}
                                        />
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

              <div className={`${chatPanelLayoutClassNames.composer} border-t border-neutral-200/80 bg-[linear-gradient(180deg,rgba(247,249,248,0.9),rgba(255,255,255,0.96))] p-3 lg:p-4`}>
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
                    ref={composerTextareaRef}
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
                    onChange={(event) => handleComposerChange(event.target.value, event.target.selectionStart)}
                    onKeyDown={handleComposerKeyDown}
                    onPaste={handleComposerPaste}
                  />
                  {shellState.activeTarget.kind === "channel" && mentionState && mentionCandidates.length > 0 ? (
                    <div className="rounded-[1.05rem] bg-white/92 p-2 ring-1 ring-neutral-200/80 shadow-[0_20px_50px_rgba(15,23,42,0.10)] backdrop-blur-sm">
                      <div className="mb-2 flex items-center gap-2 px-2 pt-1">
                        <AtSign className="size-4 text-[var(--accent)]" />
                        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Mention someone</p>
                      </div>
                      <div className="grid gap-1">
                        {mentionCandidates.map((participant, index) => (
                          <button
                            key={`${participant.participantType}:${participant.participantId}`}
                            className={`flex items-center justify-between gap-3 rounded-[0.9rem] px-3 py-2.5 text-left transition ${
                              mentionState.selectedIndex === index
                                ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                                : "text-neutral-700 hover:bg-neutral-50"
                            }`}
                            onClick={() => applyMentionSelection(participant)}
                            type="button"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{participant.displayName}</p>
                              <p className="mt-0.5 truncate text-xs text-neutral-500">
                                {participant.participantType === "agent"
                                  ? participant.agentStatus === "running"
                                    ? "Agent online"
                                    : participant.agentStatus ?? "Agent"
                                  : participant.email ?? participant.role ?? "Member"}
                              </p>
                            </div>
                            <span className="rounded-full border border-neutral-200 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-neutral-500">
                              {participant.participantType}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
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
                        : shellState.activeTarget.kind === "channel"
                          ? "Enter to send, Shift+Enter for newline, type @ to mention agents or members"
                          : "Enter to send, Shift+Enter for newline, use + or paste for local resources"}
                    </p>
                  </div>
                </div>
              </div>
              {shellState.activeTarget.kind === "channel" && (isChannelSettingsOpen || isChannelMembersOpen) ? (
                <aside className="pointer-events-none absolute inset-y-[5.75rem] right-4 z-20 w-[min(380px,calc(100%-2rem))]">
                  <div className="pointer-events-auto h-full overflow-hidden rounded-[1.5rem] bg-[rgba(255,255,255,0.96)] ring-1 ring-neutral-200/80 shadow-[0_24px_70px_rgba(15,23,42,0.14)] backdrop-blur-xl">
                    {isChannelSettingsOpen ? (
                      <div className="flex h-full flex-col">
                        <div className="flex items-center justify-between border-b border-neutral-200/80 px-5 py-4">
                          <div>
                            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Channel</p>
                            <h2 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-neutral-950">Edit details</h2>
                          </div>
                          <button className="panel-control flex size-10 items-center justify-center rounded-xl text-neutral-700" onClick={() => setIsChannelSettingsOpen(false)} type="button">
                            <X className="size-4" />
                          </button>
                        </div>
                        <div className="grid gap-4 overflow-y-auto px-5 py-5">
                          <label className="grid gap-2">
                            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Name</span>
                            <Input
                              disabled={activeChannel?.id === "chn_general"}
                              value={channelSettingsDraft.name}
                              onChange={(event) => setChannelSettingsDraft((current) => ({ ...current, name: event.target.value }))}
                            />
                            {activeChannel?.id === "chn_general" ? <p className="text-xs text-neutral-500">The #all channel keeps its canonical name.</p> : null}
                          </label>
                          <label className="grid gap-2">
                            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Description</span>
                            <textarea
                              className="min-h-[140px] w-full resize-none rounded-[1rem] bg-white/82 px-4 py-3 text-sm text-neutral-950 outline-none ring-1 ring-neutral-300/90 focus:ring-[color:color-mix(in_srgb,var(--accent)_40%,white)] focus-visible:ring-4 focus-visible:ring-[var(--accent-soft)]"
                              value={channelSettingsDraft.description}
                              onChange={(event) => setChannelSettingsDraft((current) => ({ ...current, description: event.target.value }))}
                            />
                          </label>
                        </div>
                        <div className="mt-auto flex items-center justify-between border-t border-neutral-200/80 px-5 py-4">
                          <p className="text-sm text-neutral-500">{channelSettingsNotice ?? "Shape the context people and agents see before they speak."}</p>
                          <Button onClick={() => void handleSaveChannelSettings()} size="sm" type="button" className="shadow-none">Save</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex h-full flex-col">
                        <div className="flex items-center justify-between border-b border-neutral-200/80 px-5 py-4">
                          <div>
                            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Members</p>
                            <h2 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-neutral-950">{activeChannelParticipantCount} in channel</h2>
                          </div>
                          <button className="panel-control flex size-10 items-center justify-center rounded-xl text-neutral-700" onClick={() => setIsChannelMembersOpen(false)} type="button">
                            <X className="size-4" />
                          </button>
                        </div>
                        <div className="grid gap-3 overflow-y-auto px-4 py-4">
                          {channelParticipants.map((participant) => (
                            <div key={`${participant.participantType}:${participant.participantId}`} className="rounded-[1rem] bg-white/78 px-4 py-3 ring-1 ring-neutral-200/80">
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-neutral-900">{participant.displayName}</p>
                                  <p className="mt-1 truncate text-xs text-neutral-500">
                                    {participant.participantType === "agent"
                                      ? participant.agentStatus === "running"
                                        ? "Agent online"
                                        : participant.agentStatus ?? "Agent"
                                      : participant.email ?? participant.role ?? "Member"}
                                  </p>
                                </div>
                                <Badge>{participant.participantType}</Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </aside>
              ) : null}
            </div>
          ) : shellState.primaryView === "kanban" ? (
            <div className="flex h-full flex-col">
              {selectedIssueForPage ? (
                <div className="min-h-0 flex flex-1 flex-col overflow-hidden bg-[linear-gradient(180deg,rgba(250,251,250,0.92),rgba(244,247,245,0.9))]">
                  <div className="border-b border-neutral-200/80 px-5 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <button className="inline-flex items-center gap-2 text-sm font-medium text-neutral-500 transition hover:text-neutral-900" onClick={handleCloseIssueWorkspace} type="button">
                          <ArrowLeft className="size-4" />
                          Back to board
                        </button>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <h1 className="text-[30px] font-semibold tracking-[-0.05em] text-neutral-950">{issueEditorPreview.title || selectedIssueForPage.title}</h1>
                          <StatusPill tone={getIssueStatusTone(selectedIssueForPage.status)}>{formatIssueStatus(selectedIssueForPage.status)}</StatusPill>
                        </div>
                        <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-500">
                          Issue detail, editing, and execution activity for this task.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          className="border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                          onClick={() => void handleDeleteIssue(selectedIssueForPage.id)}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          <Trash2 className="size-4" />
                          Delete
                        </Button>
                        {issueEditorNotice ? <span className="text-sm text-neutral-500">{issueEditorNotice}</span> : null}
                      </div>
                    </div>
                  </div>

                  <div className="grid min-h-0 flex-1 gap-0 xl:grid-cols-[minmax(0,1.4fr)_360px]">
                    <div className="min-h-0 overflow-y-auto px-5 py-5 xl:border-r xl:border-neutral-200/80">
                      <div className="mx-auto max-w-4xl space-y-6">
                        <section className="space-y-4">
                          <div className="rounded-[1.5rem] bg-white/86 px-5 py-5 ring-1 ring-neutral-200/80">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Issue Brief</p>
                                <p className="mt-1 text-sm text-neutral-500">Use the first line as the title. The rest supports markdown-style notes and review context.</p>
                              </div>
                              <span className="rounded-full bg-neutral-100 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-neutral-500">markdown</span>
                            </div>
                            <textarea
                              className="mt-4 min-h-[260px] w-full resize-y border-0 bg-transparent px-0 py-0 text-[17px] leading-8 text-neutral-900 outline-none placeholder:text-neutral-300"
                              placeholder={"Issue title\n\nDescribe the work, acceptance criteria, links, reviewer notes, or constraints..."}
                              value={issueEditorBrief}
                              onChange={(event) => setIssueEditorBrief(event.target.value)}
                            />
                          </div>
                        </section>

                        <section className="space-y-3 border-t border-neutral-200/80 pt-6">
                          <div>
                            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Activity</p>
                            <p className="mt-1 text-sm text-neutral-500">All edits, status transitions, and agent execution updates are recorded here.</p>
                          </div>
                          <div className="grid gap-3">
                            {selectedIssueTimeline.length === 0 ? (
                              <div className="rounded-[1.2rem] bg-white/72 px-4 py-4 text-sm text-neutral-500 ring-1 ring-neutral-200/75">No activity yet.</div>
                            ) : (
                              selectedIssueTimeline.map((item, index) =>
                                item.kind === "run" ? (
                                  <div key={`${item.log.id}-${index}`} className="rounded-[1.25rem] bg-white/82 px-4 py-4 ring-1 ring-neutral-200/75">
                                    <div className="flex items-start justify-between gap-4">
                                      <div>
                                        <p className="text-sm font-medium text-neutral-900">Execution history</p>
                                        <p className="mt-1 text-xs text-neutral-500">Session {item.log.sessionId} · {item.log.kind.replaceAll("_", " ")}</p>
                                      </div>
                                      <span className="shrink-0 font-mono text-[11px] text-neutral-400" title={createTimestampLabels(item.log.createdAt).precise}>
                                        {createTimestampLabels(item.log.createdAt).compact}
                                      </span>
                                    </div>
                                    <div className="mt-3 grid gap-3 lg:grid-cols-2">
                                      <div className="rounded-[1rem] bg-neutral-50 px-3 py-3">
                                        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-neutral-400">Prompt</p>
                                        <p className="mt-2 max-h-44 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-6 text-neutral-700">{item.log.prompt}</p>
                                      </div>
                                      <div className="rounded-[1rem] bg-neutral-50 px-3 py-3">
                                        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-neutral-400">Response</p>
                                        <p className="mt-2 max-h-44 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-6 text-neutral-700">{item.log.response || "No response captured."}</p>
                                      </div>
                                    </div>
                                  </div>
                                ) : item.activity.kind === "commented" ? (
                                  <div key={item.activity.id} className="rounded-[1.25rem] bg-white/84 ring-1 ring-neutral-200/75">
                                    <div className="flex items-center justify-between gap-3 px-4 py-3">
                                      <div className="flex items-center gap-3">
                                        <div className="flex size-10 items-center justify-center rounded-full bg-neutral-100 text-sm font-semibold text-neutral-600">
                                          {getAvatarInitials(resolveIssueActivityActorName(item.activity, workspace))}
                                        </div>
                                        <div>
                                          <p className="text-sm font-semibold text-neutral-900">{resolveIssueActivityActorName(item.activity, workspace)}</p>
                                          <p className="mt-0.5 text-xs text-neutral-500">comment</p>
                                        </div>
                                      </div>
                                      <span className="shrink-0 font-mono text-[11px] text-neutral-400" title={createTimestampLabels(item.activity.createdAt).precise}>
                                        {createTimestampLabels(item.activity.createdAt).compact}
                                      </span>
                                    </div>
                                    <div className="border-t border-neutral-200/70 px-4 py-4">
                                      <p className="whitespace-pre-wrap break-words text-sm leading-7 text-neutral-700">{item.activity.message}</p>
                                    </div>
                                  </div>
                                ) : (
                                  <div key={item.activity.id} className="flex items-start justify-between gap-4 px-1 py-1">
                                    <div className="min-w-0 text-sm text-neutral-700">
                                      <p className="font-medium text-neutral-900">{formatIssueActivity(item.activity, workspace)}</p>
                                    </div>
                                    <span className="shrink-0 font-mono text-[11px] text-neutral-400" title={createTimestampLabels(item.activity.createdAt).precise}>
                                      {createTimestampLabels(item.activity.createdAt).compact}
                                    </span>
                                  </div>
                                )
                              )
                            )}
                            <div className="rounded-[1.25rem] bg-white/86 px-4 py-4 ring-1 ring-neutral-200/75">
                              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-neutral-400">Leave a comment</p>
                              <textarea
                                className="mt-3 min-h-[110px] w-full resize-y border-0 bg-transparent px-0 py-0 text-sm leading-7 text-neutral-900 outline-none placeholder:text-neutral-400"
                                placeholder="Share review notes, feedback, or ask the agent to continue from here..."
                                value={issueCommentDraft}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter" && !event.shiftKey) {
                                    event.preventDefault();
                                    if (issueCommentDraft.trim()) {
                                      void handleCreateIssueComment();
                                    }
                                  }
                                }}
                                onChange={(event) => setIssueCommentDraft(event.target.value)}
                              />
                              <div className="mt-3 flex justify-end">
                                <Button disabled={!issueCommentDraft.trim()} onClick={() => void handleCreateIssueComment()} size="sm" type="button" variant="ghost">
                                  Comment
                                </Button>
                              </div>
                            </div>
                          </div>
                        </section>
                      </div>
                    </div>

                    <aside className="min-h-0 overflow-y-auto px-5 py-5">
                      <div className="space-y-4">
                        <div className="rounded-[1.35rem] bg-white/78 px-4 py-4 ring-1 ring-neutral-200/80">
                          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Properties</p>
                          <p className="mt-2 text-sm leading-6 text-neutral-500">When agent work is ready, move from `In Review` to `Done` or back to `Todo` after leaving feedback below.</p>
                          <div className="mt-4 grid gap-4">
                            <label className="grid gap-2">
                              <span className="text-sm font-medium text-neutral-700">Status</span>
                              <select className="h-11 rounded-xl bg-white px-3 text-sm text-neutral-900 outline-none ring-1 ring-neutral-200" value={issueEditorDraft.status} onChange={(event) => setIssueEditorDraft((current) => ({ ...current, status: event.target.value as IssueDTO["status"] }))}>
                                <option value="backlog">Backlog</option>
                                <option value="todo">Todo</option>
                                <option value="in_progress">In Progress</option>
                                <option value="in_review">In Review</option>
                                <option value="done">Done</option>
                              </select>
                            </label>
                            <label className="grid gap-2">
                              <span className="text-sm font-medium text-neutral-700">Priority</span>
                              <select className="h-11 rounded-xl bg-white px-3 text-sm text-neutral-900 outline-none ring-1 ring-neutral-200" value={issueEditorDraft.priority} onChange={(event) => setIssueEditorDraft((current) => ({ ...current, priority: event.target.value as IssueDTO["priority"] }))}>
                                <option value="low">Low</option>
                                <option value="medium">Medium</option>
                                <option value="high">High</option>
                              </select>
                            </label>
                            <label className="grid gap-2">
                              <span className="text-sm font-medium text-neutral-700">Assignee</span>
                              <select className="h-11 rounded-xl bg-white px-3 text-sm text-neutral-900 outline-none ring-1 ring-neutral-200" value={issueEditorDraft.assigneeId ?? ""} onChange={(event) => setIssueEditorDraft((current) => ({ ...current, assigneeId: event.target.value || null }))}>
                                <option value="">Unassigned</option>
                                {(workspace?.agents ?? []).map((agent) => (
                                  <option key={agent.id} value={agent.id}>{agent.name}</option>
                                ))}
                              </select>
                            </label>
                            <label className="grid gap-2">
                              <span className="text-sm font-medium text-neutral-700">Due Date</span>
                              <Input type="date" value={issueEditorDraft.dueDate} onChange={(event) => setIssueEditorDraft((current) => ({ ...current, dueDate: event.target.value }))} />
                            </label>
                          </div>
                        </div>

                        <div className="rounded-[1.35rem] bg-white/78 px-4 py-4 ring-1 ring-neutral-200/80">
                          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Details</p>
                          <div className="mt-4 grid gap-4">
                            <DetailRow label="Assignee" value={selectedAgentForIssuePage?.name ?? "Unassigned"} />
                            <DetailRow label="Created" value={formatTimestamp(selectedIssueForPage.createdAt)} />
                            <DetailRow label="Updated" value={formatTimestamp(selectedIssueForPage.updatedAt)} />
                            <DetailRow label="Source" value={selectedIssueForPage.sourceChannelId ? "Channel task" : "Global board issue"} />
                          </div>
                        </div>

                        <div className="rounded-[1.35rem] bg-white/78 px-4 py-4 ring-1 ring-neutral-200/80">
                          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Source Messages</p>
                          <div className="mt-4 grid gap-2">
                            {selectedIssuePageSourceMessages.length === 0 ? (
                              <p className="text-sm text-neutral-500">No source messages linked.</p>
                            ) : (
                              selectedIssuePageSourceMessages.slice(-4).reverse().map((message) => (
                                <div key={message.id} className="rounded-[1rem] bg-white px-3 py-3 ring-1 ring-neutral-200/75">
                                  <p className="text-xs font-medium text-neutral-500">{displayMessageSenderName(message)}</p>
                                  <p className="mt-2 line-clamp-4 text-sm leading-6 text-neutral-700">{message.content || "Attachment only update"}</p>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    </aside>
                  </div>
                </div>
              ) : (
              <>
              <div className="border-b border-neutral-200/80 px-5 py-5">
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
                    <Button onClick={() => handleOpenIssueCreateModal("backlog")} size="sm" type="button" className="shadow-none">
                      <Plus className="size-4" />
                      Add Issue
                    </Button>
                  </div>
                </div>
                <div className="mt-4 flex flex-col gap-3 rounded-[1.15rem] bg-[linear-gradient(180deg,rgba(248,250,252,0.86)_0%,rgba(255,255,255,0.96)_100%)] p-3 ring-1 ring-neutral-200/80 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-center gap-2 text-neutral-500">
                    <SlidersHorizontal className="size-4" />
                    <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em]">Board Filters</span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[480px]">
                    <select
                      className="h-10 rounded-xl bg-white/82 px-3 text-sm text-neutral-900 outline-none ring-1 ring-neutral-300/90 focus:ring-[color:color-mix(in_srgb,var(--accent)_40%,white)]"
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
                      className="h-10 rounded-xl bg-white/82 px-3 text-sm text-neutral-900 outline-none ring-1 ring-neutral-300/90 focus:ring-[color:color-mix(in_srgb,var(--accent)_40%,white)]"
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
                  {([
                    { id: "backlog", label: "Backlog", tone: "neutral" as const, helper: "Ready for product grooming" },
                    { id: "todo", label: "Todo", tone: "neutral" as const, helper: "Ready for iteration planning" },
                    { id: "in_progress", label: "In Progress", tone: "warning" as const, helper: "Active development only" },
                    { id: "in_review", label: "In Review", tone: "warning" as const, helper: "Review, test, and acceptance" },
                    { id: "done", label: "Done", tone: "success" as const, helper: "Merged, deployed, accepted" }
                  ] as Array<{
                    id: IssueDTO["status"];
                    label: string;
                    tone: "neutral" | "warning" | "success";
                    helper: string;
                  }>).map((lane) => {
                    const laneIssues = filteredKanbanIssues.filter((issue) => issue.status === lane.id);
                    const isDropActive = kanbanDropLane === lane.id;

                    return (
                      <section
                        key={lane.id}
                        className={`flex min-h-0 flex-col rounded-[1.35rem] p-3 ring-1 shadow-[0_14px_28px_rgba(15,23,42,0.04)] transition ${
                          isDropActive
                            ? "bg-[linear-gradient(180deg,rgba(79,70,229,0.08)_0%,rgba(255,255,255,0.98)_100%)] ring-[color:color-mix(in_srgb,var(--accent)_30%,white)]"
                            : "bg-[var(--panel-elevated)] ring-neutral-200/80"
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
                        <div className="mb-3 rounded-[1rem] bg-white/74 px-3 py-3 ring-1 ring-neutral-200/70">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <span
                                className={`inline-flex min-w-10 items-center justify-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${
                                  lane.tone === "success"
                                    ? "bg-emerald-100 text-emerald-700"
                                    : lane.tone === "warning"
                                      ? "bg-amber-100 text-amber-700"
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
                            <div className="flex h-full min-h-[240px] items-center justify-center rounded-[1.1rem] bg-white/68 p-6 text-center ring-1 ring-dashed ring-neutral-200/75">
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
                                  className={`rounded-[1.1rem] bg-white/84 p-4 ring-1 ring-neutral-200/80 shadow-[0_10px_24px_rgba(15,23,42,0.04)] transition ${
                                    draggingIssueId === issue.id
                                      ? "scale-[0.98] rotate-[1deg] opacity-60"
                                      : "cursor-grab hover:-translate-y-0.5 hover:bg-white hover:ring-neutral-300 hover:shadow-[0_16px_30px_rgba(15,23,42,0.06)]"
                                  }`}
                                  draggable
                                  onClick={() => handleOpenIssueWorkspace(issue.id)}
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
                                    <div className="flex items-center gap-3">
                                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                                        <CalendarDays className="size-3.5" />
                                        {issue.dueDate ? formatTimestamp(issue.dueDate) : "No due date"}
                                      </span>
                                      <button
                                        className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-medium text-rose-700 transition hover:bg-rose-100"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          void handleDeleteIssue(issue.id);
                                        }}
                                        type="button"
                                      >
                                        <Trash2 className="size-3" />
                                        Delete
                                      </button>
                                    </div>
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
              </>
              )}
            </div>
          ) : shellState.primaryView === "agents" ? (
            <div className="flex h-full flex-col">
              <div className={agentWorkspaceLayoutClassNames.viewport}>
                {selectedAgentWorkspace ? (
                  <div className={agentWorkspaceLayoutClassNames.content}>
                    <div className="shrink-0 overflow-hidden rounded-[1.25rem] bg-white">
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
                              {selectedAgentWorkspace.status === "stopped"
                                ? "Stopped"
                                : (selectedAgentWorkspaceActivityBadge?.presenceLabel ?? "Idle")}
                            </span>
                            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-neutral-400">
                              {selectedAgentWorkspace.implementation} / {selectedAgentWorkspace.model} / {selectedAgentWorkspace.reasoningEffort}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            aria-label={selectedAgentWorkspace.status === "running" ? "Stop agent" : "Start agent"}
                            className="flex h-10 items-center justify-center gap-2 rounded-[0.95rem] border border-[color:color-mix(in_srgb,var(--accent)_18%,white)] bg-[color:color-mix(in_srgb,var(--surface)_88%,white)] px-3 text-sm font-medium text-[var(--text-primary)] shadow-[0_8px_18px_rgba(15,23,42,0.05)] transition hover:border-[color:color-mix(in_srgb,var(--accent)_28%,white)] hover:bg-[color:color-mix(in_srgb,var(--accent-soft)_62%,white)] disabled:cursor-not-allowed disabled:border-neutral-200 disabled:bg-neutral-100 disabled:text-neutral-300"
                            onClick={() =>
                              handleOpenLifecycleDialog(
                                selectedAgentWorkspace.status === "running" ? "stopped" : "running",
                                selectedAgentWorkspace
                              )
                            }
                            type="button"
                          >
                            <Square className="size-4" />
                            <span>{selectedAgentWorkspace.status === "running" ? "Stop" : "Start"}</span>
                          </button>
                          <button
                            aria-label="Reset agent state"
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
                          active={agentWorkspace.mode === "logs"}
                          icon={SlidersHorizontal}
                          label="Logs"
                          onClick={() => setAgentWorkspace((current) => setAgentWorkspaceMode(current, "logs"))}
                        />
                        <AgentModeTab
                          active={agentWorkspace.mode === "memory"}
                          icon={Files}
                          label="Memory"
                          onClick={() => setAgentWorkspace((current) => setAgentWorkspaceMode(current, "memory"))}
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
                      <div className="min-h-0 flex flex-1 flex-col overflow-hidden rounded-[1.3rem] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(246,248,247,0.96))] ring-1 ring-neutral-200/80 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
                        <div className="border-b border-neutral-200/80 px-5 py-4">
                          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Prompt Constraint</p>
                          <p className="mt-3 max-w-4xl text-sm leading-7 text-neutral-700">{selectedAgentWorkspace.description}</p>
                        </div>
                        <div className="grid gap-0 lg:grid-cols-[1.1fr_1fr_0.95fr]">
                          <div className="grid gap-4 px-5 py-4 lg:border-r lg:border-neutral-200/70">
                            <DetailRow label="Runtime" value={selectedAgentWorkspaceRuntime?.name ?? selectedAgentWorkspace.runtimeId} />
                            <DetailRow label="Messages" value={String(selectedAgentWorkspaceMessages.length)} />
                            <DetailRow label="Assigned Issues" value={String(selectedAgentWorkspaceIssues.length)} />
                          </div>
                          <div className="grid gap-4 px-5 py-4 lg:border-r lg:border-neutral-200/70">
                            <DetailRow label="Implementation" value={selectedAgentWorkspace.implementation} />
                            <DetailRow label="Model" value={selectedAgentWorkspace.model} />
                            <DetailRow label="Reasoning" value={selectedAgentWorkspace.reasoningEffort} />
                          </div>
                          <div className="flex flex-col gap-2 px-5 py-4">
                            <Button onClick={() => handleOpenAgentWorkspace(selectedAgentWorkspace.id)} type="button" variant="secondary">
                              <MessageSquareText className="size-4" />
                              Open Chat Thread
                            </Button>
                            <Button onClick={() => handleOpenAgentCreateModal(selectedAgentWorkspace.runtimeId)} type="button" variant="ghost">
                              <Plus className="size-4" />
                              Create Sibling Agent
                            </Button>
                          </div>
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto border-t border-neutral-200/80 px-5 py-4">
                          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Recent Activity</p>
                          <div className="mt-3 grid gap-2">
                            {selectedAgentWorkspaceMessages.length === 0 ? (
                              <p className="text-sm text-neutral-500">This agent has not posted any messages yet.</p>
                            ) : (
                              selectedAgentWorkspaceMessages.slice(-4).reverse().map((message) => (
                                <button
                                  key={message.id}
                                  className="rounded-[0.95rem] bg-white/75 px-3 py-3 text-left ring-1 ring-neutral-200/75 transition hover:bg-white hover:ring-neutral-300"
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
                        </div>
                      </div>
                    ) : agentWorkspace.mode === "issues" ? (
                      <div className="min-h-0 flex flex-1 flex-col gap-3 overflow-hidden">
                        <div className="flex items-center justify-between gap-3 px-1">
                          <div>
                            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Assigned Issues</p>
                            <p className="mt-1 text-xs text-neutral-400">{selectedAgentWorkspaceIssues.length} issues assigned</p>
                          </div>
                          <Button onClick={() => handleOpenIssueCreateModal("backlog")} size="sm" type="button" variant="ghost">
                            <Plus className="size-4" />
                            Add Issue
                          </Button>
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto">
                          <div className="grid gap-2">
                          {selectedAgentWorkspaceIssues.length === 0 ? (
                            <EmptyState>No issues are assigned to this agent yet.</EmptyState>
                          ) : (
                            selectedAgentWorkspaceIssues.map((issue) => (
                              <button
                                key={issue.id}
                                className="rounded-[1rem] bg-white/82 px-4 py-4 text-left ring-1 ring-neutral-200/80 transition hover:bg-white hover:ring-neutral-300"
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
                      </div>
                    ) : agentWorkspace.mode === "logs" ? (
                      <div className="min-h-0 flex flex-1 flex-col gap-3 overflow-hidden">
                        <div className="flex items-center justify-between gap-3 px-1">
                          <div>
                            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Model Exchange Logs</p>
                            <p className="mt-1 text-xs text-neutral-400">{selectedAgentWorkspaceLogs.length} recorded runs</p>
                          </div>
                          <span className="rounded-full bg-white/75 px-2.5 py-1 font-mono text-[11px] text-neutral-500 ring-1 ring-neutral-200/80">
                            Loki-style details
                          </span>
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto rounded-[1rem] bg-white/82 ring-1 ring-neutral-200/80">
                          {selectedAgentWorkspaceLogs.length === 0 ? (
                            <EmptyState>No logs captured for this agent yet.</EmptyState>
                          ) : (
                            <div className="divide-y divide-neutral-200">
                              {selectedAgentWorkspaceLogs.map((log) => {
                                const isExpanded = expandedAgentLogIds[log.id] ?? false;
                                const timestamp = createTimestampLabels(log.createdAt);
                                return (
                                  <button
                                    key={log.id}
                                    className="w-full text-left transition hover:bg-neutral-50"
                                    onClick={() =>
                                      setExpandedAgentLogIds((current) => ({
                                        ...current,
                                        [log.id]: !isExpanded
                                      }))
                                    }
                                    type="button"
                                  >
                                    <div className="flex items-start gap-3 px-4 py-3">
                                      <div className="pt-0.5 text-neutral-400">
                                        {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-neutral-400" title={timestamp.precise}>
                                            {timestamp.compact}
                                          </span>
                                          <StatusPill tone={log.kind === "issue" ? "warning" : "neutral"}>{log.kind === "issue" ? "issue" : "chat"}</StatusPill>
                                          <span className="font-mono text-[11px] text-neutral-400">{log.sessionId}</span>
                                        </div>
                                        <p className="mt-2 line-clamp-2 text-[13px] leading-6 text-neutral-700">
                                          {log.prompt || "(empty prompt)"}
                                        </p>
                                        {isExpanded ? (
                                          <div className="mt-3 grid gap-3 rounded-[0.95rem] bg-neutral-50/90 p-3 ring-1 ring-neutral-200/75">
                                            <div>
                                              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500">Prompt</p>
                                              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words font-mono text-[12px] leading-6 text-neutral-800">
                                                {log.prompt}
                                              </pre>
                                            </div>
                                            <div>
                                              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500">Response</p>
                                              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words font-mono text-[12px] leading-6 text-neutral-800">
                                                {log.response || "(empty response)"}
                                              </pre>
                                            </div>
                                          </div>
                                        ) : null}
                                      </div>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : agentWorkspace.mode === "memory" ? (
                      <div className="min-h-0 flex-1 overflow-hidden rounded-[1.3rem] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(245,247,246,0.96))] ring-1 ring-neutral-200/80 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
                        <div className="grid h-full min-h-0 gap-0 lg:grid-cols-[minmax(180px,0.44fr)_minmax(0,1.56fr)]">
                          <div className="flex min-h-0 flex-col lg:border-r lg:border-neutral-200/80">
                            <div className="border-b border-neutral-200/80 px-4 py-3 lg:border-b-0">
                              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Agent Workspace</p>
                              <p className="mt-1 font-mono text-[11px] text-neutral-400">~/.workpilot/agents/{selectedAgentWorkspace.id}/</p>
                            </div>
                            <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
                              {isAgentWorkspaceFilesLoading ? (
                                <EmptyState>Loading workspace files...</EmptyState>
                              ) : agentWorkspaceFilesError ? (
                                <EmptyState>{agentWorkspaceFilesError}</EmptyState>
                              ) : agentWorkspaceFiles.length === 0 ? (
                                <EmptyState>No workspace files have been synced yet.</EmptyState>
                              ) : (
                                <AgentWorkspaceTree
                                  collapsedFolders={collapsedAgentWorkspaceFolders}
                                  onSelectFile={setSelectedAgentWorkspaceFilePath}
                                  onToggleFolder={(path, defaultCollapsed) =>
                                    setCollapsedAgentWorkspaceFolders((current) => ({
                                      ...current,
                                      [path]: !(current[path] ?? defaultCollapsed)
                                    }))
                                  }
                                  selectedFilePath={selectedAgentWorkspaceFilePath}
                                  tree={agentWorkspaceTree}
                                />
                              )}
                            </div>
                          </div>
                          <div className="flex min-h-0 flex-col">
                            <div className="border-b border-neutral-200/80 px-4 py-3">
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                  <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">File Preview</p>
                                  <p className="mt-1 text-xs text-neutral-400">{selectedAgentWorkspaceFile?.path ?? selectedAgentWorkspaceFilePath ?? "Select a file"}</p>
                                </div>
                                {selectedAgentWorkspaceFile ? (
                                  <span className="rounded-full bg-white/75 px-2.5 py-1 font-mono text-[11px] text-neutral-500 ring-1 ring-neutral-200/80">
                                    {createTimestampLabels(selectedAgentWorkspaceFile.updatedAt).compact}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                            <div className="min-h-0 flex-1 overflow-auto p-4">
                              {selectedAgentWorkspaceFile ? (
                                <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-6 text-neutral-800">
                                  {selectedAgentWorkspaceFile.content}
                                </pre>
                              ) : (
                                <EmptyState>Select a workspace file to preview it.</EmptyState>
                              )}
                            </div>
                          </div>
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
<span className="text-[13px] font-semibold text-neutral-900">
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
<p className="mt-1.5 select-text whitespace-pre-wrap break-words leading-6 text-[13px] text-neutral-700">
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
                  <div className="mx-auto flex max-w-6xl flex-col gap-4">
                    <section className="overflow-hidden rounded-[1.75rem] bg-white/92 ring-1 ring-neutral-200/80">
                      <div className="border-b border-neutral-200/80 px-5 py-4">
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                          <div className="min-w-0">
                            <div className="flex items-center gap-3">
                              <div className="flex size-11 items-center justify-center rounded-2xl bg-neutral-100 text-neutral-700 ring-1 ring-neutral-200">
                                <Monitor className="size-5" />
                              </div>
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h2 className="truncate text-[28px] font-semibold tracking-[-0.045em] text-neutral-950">
                                    {selectedRuntimeWorkspace.name}
                                  </h2>
                                  <StatusPill tone={getRuntimeStatusTone(selectedRuntimeWorkspace.status)}>{selectedRuntimeWorkspace.status}</StatusPill>
                                </div>
                                <p className="mt-1 truncate font-mono text-[11px] text-neutral-400">{selectedRuntimeWorkspace.id}</p>
                              </div>
                            </div>
                            <p className="mt-4 max-w-3xl text-sm leading-6 text-neutral-600">
                              Runtime daemons act as the host layer. A single runtime can register multiple named agents with isolated prompt constraints and independent conversations.
                            </p>
                          </div>
                          <div className="grid gap-2 sm:grid-cols-2 xl:w-[22rem]">
                            <Button onClick={() => handleOpenAgentCreateModal(selectedRuntimeWorkspace.id)} type="button" variant="secondary">
                              <Plus className="size-4" />
                              New Agent
                            </Button>
                            <Button onClick={() => void handleOpenRuntimeConnectPanel()} type="button" variant="ghost">
                              <Sparkles className="size-4" />
                              Connect
                            </Button>
                            <Button onClick={() => handleOpenDetailPanel("runtime", selectedRuntimeWorkspace.id)} type="button" variant="ghost">
                              <FileText className="size-4" />
                              Inspect
                            </Button>
                            <Button onClick={() => void handleGenerateCommand()} type="button" variant="ghost">
                              <Sparkles className="size-4" />
                              Install
                            </Button>
                            <Button
                              className="sm:col-span-2 border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                              onClick={() => handleOpenRuntimeDeleteDialog(selectedRuntimeWorkspace.id)}
                              type="button"
                              variant="ghost"
                            >
                              <Trash2 className="size-4" />
                              Delete
                            </Button>
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-0 xl:grid-cols-[minmax(0,0.92fr)_minmax(340px,1.08fr)]">
                        <div className="border-b border-neutral-200/80 xl:border-b-0 xl:border-r xl:border-neutral-200/80">
                          <div className="grid gap-3 p-5 sm:grid-cols-2">
                            <div className="rounded-[1.2rem] bg-neutral-50/90 px-4 py-3 ring-1 ring-neutral-200/70">
                              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Status</p>
                              <p className="mt-2 text-base font-semibold text-neutral-950">{selectedRuntimeWorkspace.status}</p>
                              {selectedRuntimePresenceDetail ? (
                                <p className="mt-1 text-xs text-neutral-500">{selectedRuntimePresenceDetail}</p>
                              ) : (
                                <p className="mt-1 text-xs text-neutral-500">Waiting for fresh daemon presence updates.</p>
                              )}
                            </div>
                            <div className="rounded-[1.2rem] bg-neutral-50/90 px-4 py-3 ring-1 ring-neutral-200/70">
                              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Attached Agents</p>
                              <p className="mt-2 text-base font-semibold text-neutral-950">{runtimeWorkspaceAgents.length}</p>
                              <p className="mt-1 text-xs text-neutral-500">Agents currently assigned to this host runtime.</p>
                            </div>
                            <div className="rounded-[1.2rem] bg-neutral-50/90 px-4 py-3 ring-1 ring-neutral-200/70">
                              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Mode</p>
                              <p className="mt-2 text-base font-semibold text-neutral-950">Daemon host</p>
                              <p className="mt-1 text-xs text-neutral-500">The daemon owns agent lifecycles, sessions, and task execution.</p>
                            </div>
                            <div className="rounded-[1.2rem] bg-neutral-50/90 px-4 py-3 ring-1 ring-neutral-200/70">
                              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Routing</p>
                              <p className="mt-2 text-base font-semibold text-neutral-950">Direct + channel chat</p>
                              <p className="mt-1 text-xs text-neutral-500">Each conversation route keeps its own isolated session context.</p>
                            </div>
                          </div>
                        </div>

                        <div className="min-h-[28rem] p-5">
                          <div className="flex h-full min-h-0 flex-col">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Agents</p>
                                <p className="mt-1 text-sm text-neutral-500">Attached workers on this runtime host.</p>
                              </div>
                            </div>
                            <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
                              {runtimeWorkspaceAgents.length === 0 ? (
                                <div className="flex h-full min-h-[16rem] items-center justify-center rounded-[1.25rem] bg-neutral-50/80 text-sm text-neutral-500 ring-1 ring-neutral-200/70">
                                  No agents are attached to this runtime yet.
                                </div>
                              ) : (
                                <div className="grid gap-2.5">
                                  {runtimeWorkspaceAgents.map((agent) => (
                                    <div
                                      key={agent.id}
                                      className="rounded-[1.2rem] bg-neutral-50/75 px-4 py-3 transition hover:bg-neutral-50 ring-1 ring-neutral-200/75"
                                    >
                                      <div className="flex items-start justify-between gap-3">
                                        <button className="min-w-0 flex-1 text-left" onClick={() => handleOpenAgentWorkspace(agent.id)} type="button">
                                          <div className="flex items-center gap-3">
                                            <div className={`${getActorAvatarClass("agent")} size-10 shrink-0 text-emerald-700`}>
                                              <Bot className="size-4" />
                                            </div>
                                            <div className="min-w-0">
                                              <div className="flex flex-wrap items-center gap-2">
                                                <p className="truncate text-sm font-semibold text-neutral-950">{agent.name}</p>
                                                <span className="rounded-full bg-white px-2 py-0.5 font-mono text-[10px] text-neutral-500 ring-1 ring-neutral-200">
                                                  {agent.implementation}
                                                </span>
                                              </div>
                                              <p className="mt-1 font-mono text-[11px] text-neutral-500">{agent.model}</p>
                                            </div>
                                          </div>
                                          <p className="mt-3 line-clamp-2 text-xs leading-5 text-neutral-600">{agent.description}</p>
                                        </button>
                                        <Button onClick={() => handleOpenAgentWorkspace(agent.id)} size="sm" type="button" variant="ghost">
                                          Chat
                                        </Button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </section>
                  </div>
                ) : (
                  <EmptyState>No runtimes connected yet.</EmptyState>
                )}
              </div>
            </div>
          ) : shellState.primaryView === "users" ? (
            <div className="flex h-full flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-5">
                {(() => {
                  const selectedUser = selectedUserIdForPage
                    ? organizationMembers.find((m) => m.userId === selectedUserIdForPage) ?? null
                    : organizationMembers[0] ?? null;

                  if (!selectedUser) {
                    return <EmptyState>No members in this workspace yet.</EmptyState>;
                  }

                  return (
                    <div className="mx-auto max-w-6xl space-y-4">
                      <div className="rounded-[1.25rem] border border-neutral-200 bg-white p-4">
                        <div className="flex items-start gap-4">
                          <AvatarBadge
                            imageUrl={selectedUser.userId === session?.userId ? accountAvatarImage : null}
                            glyphId={selectedUser.userId === session?.userId ? accountAvatarGlyphId : getAvatarGlyph(selectedUser.userId)}
                            name={selectedUser.email.split("@")[0]}
                            paletteId={selectedUser.userId === session?.userId ? accountAvatarPaletteId : getAvatarPalette(selectedUser.userId).id}
                            size="lg"
                          />
                          <div>
                            <h2 className="text-[26px] font-semibold tracking-[-0.04em] text-neutral-950">
                              {selectedUser.email.split("@")[0]}
                            </h2>
                            <p className="mt-1 font-mono text-[11px] text-neutral-400">{selectedUser.userId}</p>
                            <p className="mt-1 text-sm text-neutral-500">{selectedUser.email}</p>
                          </div>
                        </div>
                      </div>
                      <div className="grid gap-4 lg:grid-cols-3">
                        <DetailCard>
                          <DetailRow label="Role" value={selectedUser.role} />
                          <DetailRow label="Email" value={selectedUser.email} />
                          <DetailRow label="User ID" value={selectedUser.userId} />
                        </DetailCard>
                        <DetailCard>
                          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Member Info</p>
                          <p className="mt-3 text-sm leading-6 text-neutral-600">
                            Workspace members can collaborate in channels, interact with agents, and manage issues.
                          </p>
                        </DetailCard>
                        <DetailCard>
                          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Invite Member</p>
                          <div className="mt-3 flex flex-col gap-2">
                            <Input
                              onChange={(event) => setInviteEmail(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  void handleInviteMember();
                                }
                              }}
                              placeholder="Email address"
                              value={inviteEmail}
                            />
                            <div className="flex gap-2">
                              <select
                                className="flex-1 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700"
                                onChange={(event) => setInviteRole(event.target.value as "member" | "admin")}
                                value={inviteRole}
                              >
                                <option value="member">Member</option>
                                <option value="admin">Admin</option>
                              </select>
                              <Button disabled={!inviteEmail.trim()} onClick={() => void handleInviteMember()} size="sm" type="button">
                                Invite
                              </Button>
                            </div>
                          </div>
                        </DetailCard>
                      </div>
                      {workspaceInvitations.length > 0 ? (
                        <DetailCard accent="agent">
                          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Pending Invitations</p>
                          <div className="mt-3 grid gap-2">
                            {workspaceInvitations.filter((inv) => !inv.acceptedAt).map((invitation) => (
                              <div key={invitation.id} className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white px-3 py-2.5">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium text-neutral-900">{invitation.email}</p>
                                  <p className="mt-0.5 font-mono text-[11px] text-neutral-400">
                                    {invitation.role} · invited {new Date(invitation.createdAt).toLocaleDateString()}
                                  </p>
                                </div>
                                <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-amber-200">
                                  pending
                                </span>
                              </div>
                            ))}
                            {workspaceInvitations.filter((inv) => inv.acceptedAt).map((invitation) => (
                              <div key={invitation.id} className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white px-3 py-2.5">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium text-neutral-900">{invitation.email}</p>
                                  <p className="mt-0.5 font-mono text-[11px] text-neutral-400">
                                    {invitation.role} · accepted {new Date(invitation.acceptedAt!).toLocaleDateString()}
                                  </p>
                                </div>
                                <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200">
                                  accepted
                                </span>
                              </div>
                            ))}
                          </div>
                        </DetailCard>
                      ) : null}
                    </div>
                  );
                })()}
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col">
              <div className="border-b border-neutral-200 px-5 py-4">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-4">
                    <Settings className="size-5 text-neutral-400" />
                    <h1 className="text-[28px] font-semibold tracking-[-0.04em]">
                      Settings ({selectedWorkspaceOption?.label ?? "Workspace"})
                    </h1>
                  </div>
                  <div className="flex gap-1 rounded-[1rem] border border-neutral-200 bg-neutral-100 p-1">
                    <button
                      className={`rounded-[0.85rem] px-4 py-2 text-sm font-medium transition ${
                        settingsTab === "account"
                          ? "bg-white text-neutral-900 shadow-sm"
                          : "text-neutral-500 hover:text-neutral-700"
                      }`}
                      onClick={() => setSettingsTab("account")}
                      type="button"
                    >
                      Account
                    </button>
                    <button
                      className={`rounded-[0.85rem] px-4 py-2 text-sm font-medium transition ${
                        settingsTab === "appearance"
                          ? "bg-white text-neutral-900 shadow-sm"
                          : "text-neutral-500 hover:text-neutral-700"
                      }`}
                      onClick={() => setSettingsTab("appearance")}
                      type="button"
                    >
                      Appearance
                    </button>
                    <button
                      className={`rounded-[0.85rem] px-4 py-2 text-sm font-medium transition ${
                        settingsTab === "permissions"
                          ? "bg-white text-neutral-900 shadow-sm"
                          : "text-neutral-500 hover:text-neutral-700"
                      }`}
                      onClick={() => setSettingsTab("permissions")}
                      type="button"
                    >
                      Permissions
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-5">
                <div className="mx-auto grid max-w-3xl gap-4">
                  {settingsTab === "account" && (
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
                  )}

                  {settingsTab === "appearance" && (
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
                  )}

                  {settingsTab === "account" && (
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
                    {settingsNotice && settingsTab === "account" ? <p className="mt-4 text-sm text-neutral-500">{settingsNotice}</p> : null}
                  </DetailCard>
                  )}

                  {settingsTab === "permissions" && (
                  <>
                  <DetailCard>
                    <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Invite Members</p>
                    <div className="mt-4 flex gap-2">
                      <Input
                        placeholder="Email address"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                      />
                      <select
                        className="rounded-[0.85rem] border border-neutral-200 px-3 py-2 text-sm"
                        value={inviteRole}
                        onChange={(e) => setInviteRole(e.target.value as "member" | "admin")}
                      >
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                      </select>
                      <Button disabled={!inviteEmail.trim()} onClick={() => void handleInviteMember()} size="sm" type="button" variant="primary">
                        Invite
                      </Button>
                    </div>
                  </DetailCard>

                  <DetailCard>
                    <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Resource Permissions</p>
                    <p className="mt-2 text-xs text-neutral-500">Manage runtime and agent access for team members.</p>
                    <div className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
                      <p className="text-sm text-neutral-500">Configure permissions to control who can access agents and runtimes.</p>
                    </div>
                  </DetailCard>
                  </>
                  )}
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
                      <div className="flex flex-col items-end gap-1">
                        <StatusPill tone={getRuntimeStatusTone(selectedRuntime.status)}>{selectedRuntime.status}</StatusPill>
                        {getRuntimePresenceDetail(selectedRuntime) ? (
                          <span className="font-mono text-[11px] text-neutral-400">{getRuntimePresenceDetail(selectedRuntime)}</span>
                        ) : null}
                      </div>
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
              <Layers className="size-3" />
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
          <span>{session.email}</span>
        </div>
      </footer>

      {agentActionDialog ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[rgba(18,24,38,0.34)] px-4 py-8 backdrop-blur-[4px]">
          <div className="w-full max-w-2xl rounded-[1.75rem] border border-neutral-200 bg-white p-6 shadow-[var(--shadow-md)] lg:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Agent Control</p>
                <h2 className="mt-2 text-[32px] font-semibold tracking-[-0.05em] text-neutral-950">
                  {agentActionDialog.kind === "confirm" ? agentActionDialog.title : `Reset ${dialogAgent?.name ?? "Agent"}`}
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-500">
                  {agentActionDialog.kind === "confirm"
                    ? agentActionDialog.description
                    : "Choose how much agent state to clear. Stop and delete are handled as separate actions."}
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
                  onClick={() => void handleRestartAgent("reset_session", dialogAgent ?? undefined)}
                  type="button"
                >
                  <p className="text-sm font-semibold text-neutral-950">Reset Session</p>
                  <p className="mt-1 text-sm leading-6 text-neutral-500">Close the current session and start a fresh one, while keeping memory and worklog files.</p>
                </button>
                <button
                  className="rounded-[1.2rem] border border-amber-200 bg-amber-50 px-4 py-4 text-left transition hover:border-amber-300 hover:bg-amber-100"
                  onClick={() => void handleRestartAgent("reset_memory", dialogAgent ?? undefined)}
                  type="button"
                >
                  <p className="text-sm font-semibold text-amber-700">Reset Memory</p>
                  <p className="mt-1 text-sm leading-6 text-amber-700">Recreate the agent workspace from a clean scaffold, removing old memory, session artifacts, and stale local files.</p>
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

              <label className="grid gap-1.5">
                <span className="text-sm font-medium text-neutral-700">Description</span>
                <textarea
                  className="min-h-28 rounded-[1rem] border border-neutral-200 bg-[var(--panel-muted)] px-4 py-3 text-sm leading-6 text-neutral-800 outline-none transition placeholder:text-neutral-400 focus:border-[var(--accent)] focus:bg-white"
                  placeholder="What is this channel for? Give people and agents enough context to collaborate well."
                  value={channelDraftDescription}
                  onChange={(event) => setChannelDraftDescription(event.target.value)}
                />
              </label>

              <div className="grid gap-3 rounded-[1.15rem] border border-neutral-200 bg-[var(--panel-muted)]/65 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-neutral-800">Members</p>
                    <p className="mt-1 text-xs text-neutral-500">Creator is added automatically. Invite people and agents now or leave it empty.</p>
                  </div>
                  <Badge>{channelDraftUserIds.length + channelDraftAgentIds.length} selected</Badge>
                </div>

                <div className="grid gap-2">
                  <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">People</p>
                  <div className="flex flex-wrap gap-2">
                    {organizationMembers
                      .filter((member) => member.userId !== session?.userId)
                      .map((member) => {
                        const selected = channelDraftUserIds.includes(member.userId);
                        return (
                          <button
                            key={member.userId}
                            className={`rounded-full border px-3 py-2 text-left text-sm transition ${
                              selected
                                ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                                : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300"
                            }`}
                            onClick={() => toggleChannelDraftUser(member.userId)}
                            type="button"
                          >
                            <span className="block font-medium">{member.email || member.userId}</span>
                            <span className="block text-[11px] uppercase tracking-[0.16em] opacity-70">{member.role}</span>
                          </button>
                        );
                      })}
                    {organizationMembers.filter((member) => member.userId !== session?.userId).length === 0 ? (
                      <p className="text-xs text-neutral-400">No additional people available yet.</p>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-2">
                  <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">Agents</p>
                  <div className="flex flex-wrap gap-2">
                    {workspace?.agents.map((agent) => {
                      const selected = channelDraftAgentIds.includes(agent.id);
                      return (
                        <button
                          key={agent.id}
                          className={`rounded-full border px-3 py-2 text-left text-sm transition ${
                            selected
                              ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                              : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300"
                          }`}
                          onClick={() => toggleChannelDraftAgent(agent.id)}
                          type="button"
                        >
                          <span className="block font-medium">{agent.name}</span>
                          <span className="block text-[11px] uppercase tracking-[0.16em] opacity-70">
                            {agent.implementation} / {agent.model}
                          </span>
                        </button>
                      );
                    })}
                    {(workspace?.agents.length ?? 0) === 0 ? <p className="text-xs text-neutral-400">No agents available yet.</p> : null}
                  </div>
                </div>
              </div>

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
          const runtimePresenceDetail = getRuntimePresenceDetail(runtime);

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
                    <div className="mt-1 pl-6">
                      <p className="font-mono text-[11px] text-neutral-400">{runtimeAgents.length} agents</p>
                      {runtimePresenceDetail ? (
                        <p className="mt-0.5 font-mono text-[11px] text-neutral-400">{runtimePresenceDetail}</p>
                      ) : null}
                    </div>
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

function StatusLaneIcon({ config }: { config: StatusLaneConfig }) {
  const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
    CircleDot,
    Circle,
    Loader,
    Eye,
    Check,
  };
  const IconComponent = iconMap[config.icon] ?? Circle;
  return (
    <div
      className="flex size-7 shrink-0 items-center justify-center rounded-lg"
      style={{
        background: `linear-gradient(135deg, ${config.color}, ${config.colorLight})`,
      }}
    >
      <IconComponent className="size-3.5 text-white" />
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

function formatIssueActivity(activity: IssueActivityDTO, workspace: WorkspaceBootstrapPayload | null) {
  const actorName = resolveIssueActivityActorName(activity, workspace);

  switch (activity.kind) {
    case "created":
      return `${actorName} created this issue`;
    case "status_changed":
      return `${actorName} changed status from ${formatIssueStatus((activity.fromValue as IssueDTO["status"]) ?? "backlog")} to ${formatIssueStatus((activity.toValue as IssueDTO["status"]) ?? "backlog")}`;
    case "assignee_changed":
      return `${actorName} updated the assignee`;
    case "priority_changed":
      return `${actorName} changed priority from ${activity.fromValue ?? "none"} to ${activity.toValue ?? "none"}`;
    case "due_date_changed":
      return `${actorName} updated the due date`;
    case "title_changed":
      return `${actorName} renamed the issue`;
    case "description_changed":
      return `${actorName} updated the description`;
    case "commented":
      return `${actorName} posted an update`;
    default:
      return `${actorName} updated the issue`;
  }
}

function resolveIssueActivityActorName(activity: IssueActivityDTO, workspace: WorkspaceBootstrapPayload | null) {
  return (
    workspace?.agents.find((agent) => agent.id === activity.actorId)?.name ??
    workspace?.messages.find((message) => message.senderId === activity.actorId)?.senderId ??
    activity.actorId
  );
}

function formatIssueBrief(title: string, description: string) {
  return [title.trim(), description.trim()].filter(Boolean).join("\n\n");
}

function parseIssueBrief(input: string) {
  const lines = input.replace(/\r\n/g, "\n").split("\n");
  const firstContentIndex = lines.findIndex((line) => line.trim().length > 0);

  if (firstContentIndex < 0) {
    return {
      title: "",
      description: ""
    };
  }

  const rawTitle = lines[firstContentIndex]?.trim() ?? "";
  const title = rawTitle.replace(/^#\s*/, "").trim();
  const description = lines.slice(firstContentIndex + 1).join("\n").trim();

  return {
    title,
    description
  };
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
    case "users":
      return "Members";
    case "settings":
      return "Settings";
    default:
      return view;
  }
}

type AgentWorkspaceTreeNode =
  | {
      kind: "folder";
      path: string;
      label: string;
      depth: number;
      defaultCollapsed: boolean;
      children: AgentWorkspaceTreeNode[];
    }
  | {
      kind: "file";
      path: string;
      label: string;
      depth: number;
      size: number;
    };

function buildAgentWorkspaceTree(files: AgentWorkspaceFileSummaryDTO[], _collapsedFolders: Record<string, boolean>) {
  const root: AgentWorkspaceTreeNode[] = [];
  const folderMap = new Map<string, Extract<AgentWorkspaceTreeNode, { kind: "folder" }>>();

  for (const file of [...files].sort((left, right) => left.path.localeCompare(right.path))) {
    const segments = file.path.split("/").filter(Boolean);
    let parentChildren = root;

    for (let index = 0; index < segments.length - 1; index += 1) {
      const folderPath = segments.slice(0, index + 1).join("/");
      let folderNode = folderMap.get(folderPath);

      if (!folderNode) {
        folderNode = {
          kind: "folder",
          path: folderPath,
          label: segments[index] ?? folderPath,
          depth: index,
          defaultCollapsed: index > 0,
          children: []
        };
        folderMap.set(folderPath, folderNode);
        parentChildren.push(folderNode);
      }

      parentChildren = folderNode.children;
    }

    parentChildren.push({
      kind: "file",
      path: file.path,
      label: segments[segments.length - 1] ?? file.path,
      depth: Math.max(segments.length - 1, 0),
      size: file.size
    });
  }

  return root;
}

function AgentWorkspaceTree({
  tree,
  collapsedFolders,
  onToggleFolder,
  onSelectFile,
  selectedFilePath
}: {
  tree: AgentWorkspaceTreeNode[];
  collapsedFolders: Record<string, boolean>;
  onToggleFolder: (path: string, defaultCollapsed: boolean) => void;
  onSelectFile: (path: string) => void;
  selectedFilePath: string | null;
}) {
  return (
    <div className="grid gap-0.5">
      {tree.map((node) => (
        <AgentWorkspaceTreeNodeView
          key={node.path}
          collapsedFolders={collapsedFolders}
          node={node}
          onSelectFile={onSelectFile}
          onToggleFolder={onToggleFolder}
          selectedFilePath={selectedFilePath}
        />
      ))}
    </div>
  );
}

function AgentWorkspaceTreeNodeView({
  node,
  collapsedFolders,
  onToggleFolder,
  onSelectFile,
  selectedFilePath
}: {
  node: AgentWorkspaceTreeNode;
  collapsedFolders: Record<string, boolean>;
  onToggleFolder: (path: string, defaultCollapsed: boolean) => void;
  onSelectFile: (path: string) => void;
  selectedFilePath: string | null;
}) {
  if (node.kind === "file") {
    return (
      <button
        className={`flex w-full items-center justify-between gap-3 rounded-[0.8rem] px-3 py-1.5 text-left transition ${
          selectedFilePath === node.path
            ? "bg-emerald-50 text-emerald-900 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.18)]"
            : "text-neutral-700 hover:bg-neutral-100/80"
        }`}
        onClick={() => onSelectFile(node.path)}
        style={{ paddingLeft: `${12 + node.depth * 18}px` }}
        type="button"
      >
        <span className="flex min-w-0 items-center gap-2">
          <FileText className="size-3.5 shrink-0 text-neutral-400" />
          <span className="min-w-0 truncate font-mono text-[12px] leading-5">{node.label}</span>
        </span>
        <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.12em] text-neutral-400">
          {formatFileSize(node.size)}
        </span>
      </button>
    );
  }

  const isCollapsed = collapsedFolders[node.path] ?? node.defaultCollapsed;

  return (
    <div className="grid gap-0.5">
      <button
        className="flex w-full items-center gap-2 rounded-[0.8rem] px-3 py-1.5 text-left text-[12px] font-medium text-neutral-600 transition hover:bg-neutral-100/80"
        onClick={() => onToggleFolder(node.path, node.defaultCollapsed)}
        style={{ paddingLeft: `${12 + node.depth * 18}px` }}
        type="button"
      >
        {isCollapsed ? <ChevronRight className="size-3.5 shrink-0 text-neutral-400" /> : <ChevronDown className="size-3.5 shrink-0 text-neutral-400" />}
        {isCollapsed ? <Folder className="size-3.5 shrink-0 text-amber-500" /> : <FolderOpen className="size-3.5 shrink-0 text-amber-500" />}
        <span className="truncate">{node.label}</span>
      </button>
      {!isCollapsed ? (
        <div className="grid gap-0.5">
          {node.children.map((child) => (
            <AgentWorkspaceTreeNodeView
              key={child.path}
              collapsedFolders={collapsedFolders}
              node={child}
              onSelectFile={onSelectFile}
              onToggleFolder={onToggleFolder}
              selectedFilePath={selectedFilePath}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function formatFileSize(size: number) {
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (size >= 1024) {
    return `${Math.round(size / 1024)} KB`;
  }

  return `${size} B`;
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

function getMentionDraft(value: string, caret: number) {
  const beforeCaret = value.slice(0, caret);
  const match = /(^|\s)@([\w.-]*)$/.exec(beforeCaret);

  if (!match || match.index === undefined) {
    return null;
  }

  const prefix = match[1] ?? "";
  const query = match[2] ?? "";
  const start = match.index + prefix.length;

  return {
    query,
    start,
    end: caret
  };
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
