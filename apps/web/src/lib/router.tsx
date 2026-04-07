import { useEffect, useState, createContext, useContext, useCallback, type ReactNode } from "react";

interface RouterContextValue {
  pathname: string;
  params: Record<string, string>;
  navigate: (path: string) => void;
}

const RouterCtx = createContext<RouterContextValue | null>(null);

function useRouterContext() {
  const ctx = useContext(RouterCtx);
  if (!ctx) throw new Error("Router hooks require Router context");
  return ctx;
}

export function useParams<T extends Record<string, string> = Record<string, string>>(): T {
  const { params } = useRouterContext();
  return params as T;
}

export function useNavigate() {
  const { navigate } = useRouterContext();
  return navigate;
}

export function usePathname() {
  const { pathname } = useRouterContext();
  return pathname;
}

function matchPath(pattern: string[], pathname: string): { params: Record<string, string> } | null {
  const patternParts = pattern.filter(Boolean);
  const pathnameParts = pathname.split("/").filter(Boolean);

  if (patternParts.length !== pathnameParts.length) return null;

  const params: Record<string, string> = {};

  for (let i = 0; i < patternParts.length; i++) {
    const p = patternParts[i];
    const p2 = pathnameParts[i];

    if (p.startsWith(":")) {
      params[p.slice(1)] = p2;
    } else if (p !== p2) {
      return null;
    }
  }

  return { params };
}

export interface RouteDefinition {
  pattern: string;
  parse: (pathname: string) => { params: Record<string, string> } | null;
}

export const routes: RouteDefinition[] = [
  { pattern: "/login", parse: (p) => p === "/login" ? { params: {} } : null },
  { pattern: "/", parse: (p) => p === "/" || p === "" ? { params: {} } : null },
  { pattern: "/workspace/:workspaceId", parse: (p) => matchPath(["workspace", ":workspaceId"], p) },
  { pattern: "/workspace/:workspaceId/chat", parse: (p) => matchPath(["workspace", ":workspaceId", "chat"], p) },
  { pattern: "/workspace/:workspaceId/channel/:channelId", parse: (p) => matchPath(["workspace", ":workspaceId", "channel", ":channelId"], p) },
  { pattern: "/workspace/:workspaceId/agent/:agentId", parse: (p) => matchPath(["workspace", ":workspaceId", "agent", ":agentId"], p) },
  { pattern: "/workspace/:workspaceId/issues", parse: (p) => matchPath(["workspace", ":workspaceId", "issues"], p) },
  { pattern: "/workspace/:workspaceId/issues/:issueId", parse: (p) => matchPath(["workspace", ":workspaceId", "issues", ":issueId"], p) },
  { pattern: "/workspace/:workspaceId/agents", parse: (p) => matchPath(["workspace", ":workspaceId", "agents"], p) },
  { pattern: "/workspace/:workspaceId/runtimes", parse: (p) => matchPath(["workspace", ":workspaceId", "runtimes"], p) },
  { pattern: "/workspace/:workspaceId/users", parse: (p) => matchPath(["workspace", ":workspaceId", "users"], p) },
  { pattern: "/workspace/:workspaceId/user/:userId", parse: (p) => matchPath(["workspace", ":workspaceId", "user", ":userId"], p) },
  { pattern: "/workspace/:workspaceId/settings", parse: (p) => matchPath(["workspace", ":workspaceId", "settings"], p) },
];

export function matchRoute(pathname: string): { route: RouteDefinition; params: Record<string, string> } | null {
  for (const route of routes) {
    const result = route.parse(pathname);
    if (result) {
      return { route, params: result.params };
    }
  }
  return null;
}

export function buildPath(template: string, params: Record<string, string>): string {
  let path = template;
  for (const [key, value] of Object.entries(params)) {
    path = path.replace(`:${key}`, value);
  }
  return path;
}

export interface RouterState {
  workspaceId: string;
  primaryView: "chat" | "issues" | "agents" | "runtimes" | "users" | "settings";
  activeChannelId: string | null;
  activeAgentId: string | null;
  activeIssueId: string | null;
  activeUserId: string | null;
  isLoginPage: boolean;
  isRoot: boolean;
}

export function parseRouterState(pathname: string): RouterState {
  const match = matchRoute(pathname);

  if (!match || match.route.pattern === "/login") {
    return {
      workspaceId: "",
      primaryView: "chat",
      activeChannelId: null,
      activeAgentId: null,
      activeIssueId: null,
      activeUserId: null,
      isLoginPage: true,
      isRoot: false,
    };
  }

  const { params } = match;
  const workspaceId = params.workspaceId || "";

  if (match.route.pattern === "/") {
    return {
      workspaceId,
      primaryView: "chat",
      activeChannelId: null,
      activeAgentId: null,
      activeIssueId: null,
      activeUserId: null,
      isLoginPage: false,
      isRoot: true,
    };
  }

  if (match.route.pattern === "/workspace/:workspaceId") {
    return {
      workspaceId,
      primaryView: "chat",
      activeChannelId: null,
      activeAgentId: null,
      activeIssueId: null,
      activeUserId: null,
      isLoginPage: false,
      isRoot: false,
    };
  }

  if (match.route.pattern === "/workspace/:workspaceId/chat") {
    return {
      workspaceId,
      primaryView: "chat",
      activeChannelId: null,
      activeAgentId: null,
      activeIssueId: null,
      activeUserId: null,
      isLoginPage: false,
      isRoot: false,
    };
  }

  if (match.route.pattern === "/workspace/:workspaceId/channel/:channelId") {
    return {
      workspaceId,
      primaryView: "chat",
      activeChannelId: params.channelId || null,
      activeAgentId: null,
      activeIssueId: null,
      activeUserId: null,
      isLoginPage: false,
      isRoot: false,
    };
  }

  if (match.route.pattern === "/workspace/:workspaceId/agent/:agentId") {
    return {
      workspaceId,
      primaryView: "chat",
      activeChannelId: null,
      activeAgentId: params.agentId || null,
      activeIssueId: null,
      activeUserId: null,
      isLoginPage: false,
      isRoot: false,
    };
  }

  if (match.route.pattern === "/workspace/:workspaceId/issues") {
    return {
      workspaceId,
      primaryView: "issues",
      activeChannelId: null,
      activeAgentId: null,
      activeIssueId: null,
      activeUserId: null,
      isLoginPage: false,
      isRoot: false,
    };
  }

  if (match.route.pattern === "/workspace/:workspaceId/issues/:issueId") {
    return {
      workspaceId,
      primaryView: "issues",
      activeChannelId: null,
      activeAgentId: null,
      activeIssueId: params.issueId || null,
      activeUserId: null,
      isLoginPage: false,
      isRoot: false,
    };
  }

  if (match.route.pattern === "/workspace/:workspaceId/agents") {
    return {
      workspaceId,
      primaryView: "agents",
      activeChannelId: null,
      activeAgentId: null,
      activeIssueId: null,
      activeUserId: null,
      isLoginPage: false,
      isRoot: false,
    };
  }

  if (match.route.pattern === "/workspace/:workspaceId/runtimes") {
    return {
      workspaceId,
      primaryView: "runtimes",
      activeChannelId: null,
      activeAgentId: null,
      activeIssueId: null,
      activeUserId: null,
      isLoginPage: false,
      isRoot: false,
    };
  }

  if (match.route.pattern === "/workspace/:workspaceId/users") {
    return {
      workspaceId,
      primaryView: "users",
      activeChannelId: null,
      activeAgentId: null,
      activeIssueId: null,
      activeUserId: null,
      isLoginPage: false,
      isRoot: false,
    };
  }

  if (match.route.pattern === "/workspace/:workspaceId/user/:userId") {
    return {
      workspaceId,
      primaryView: "users",
      activeChannelId: null,
      activeAgentId: null,
      activeIssueId: null,
      activeUserId: params.userId || null,
      isLoginPage: false,
      isRoot: false,
    };
  }

  if (match.route.pattern === "/workspace/:workspaceId/settings") {
    return {
      workspaceId,
      primaryView: "settings",
      activeChannelId: null,
      activeAgentId: null,
      activeIssueId: null,
      activeUserId: null,
      isLoginPage: false,
      isRoot: false,
    };
  }

  return {
    workspaceId: "",
    primaryView: "chat",
    activeChannelId: null,
    activeAgentId: null,
    activeIssueId: null,
    activeUserId: null,
    isLoginPage: false,
    isRoot: false,
  };
}

interface RouterProps {
  children: ReactNode;
}

export function Router({ children }: RouterProps) {
  const [pathname, setPathname] = useState(() => {
    if (typeof window !== "undefined") {
      return window.location.pathname || "/";
    }
    return "/";
  });

  useEffect(() => {
    const handlePopState = () => {
      setPathname(window.location.pathname);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigate = useCallback((to: string) => {
    window.history.pushState(null, "", to);
    setPathname(to);
  }, []);

  const match = matchRoute(pathname);
  const params = match?.params ?? {};

  return (
    <RouterCtx.Provider value={{ pathname, params, navigate }}>
      {children}
    </RouterCtx.Provider>
  );
}
