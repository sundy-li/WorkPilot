import { appendFile, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getAgentImplementationDefinition, type AgentIdentity } from "@workpilot/shared";
import type { AgentWorkspaceFileContentDTO } from "@workpilot/shared";

export interface DaemonAgentHost {
  start(): Promise<void>;
  syncAgents(agents: AgentIdentity[]): Promise<void>;
  setAgentStatus(agentId: string, status: AgentIdentity["status"]): Promise<void>;
  restartAgent(agentId: string, mode: "restart" | "reset_session" | "reset_memory" | "full_reset" | null): Promise<void>;
  deleteAgent(agentId: string): Promise<void>;
  run(agent: AgentIdentity, prompt: string, options?: { conversationKey?: string }): Promise<{
    sessionId: string;
    implementationPackage: string;
    responseText: string;
  }>;
  listWorkspaceFiles(agentId: string): Promise<AgentWorkspaceFileContentDTO[]>;
  stop(): Promise<void>;
}

type SandboxSessionEventListener = (event: unknown) => void;

export interface SandboxSessionLike {
  id: string;
  prompt(prompt: Array<{ type: "text"; text: string }>): Promise<unknown>;
  onEvent?(listener: SandboxSessionEventListener): (() => void) | void;
  onPermissionRequest?(listener: (request: { id: string }) => void | Promise<void>): (() => void) | void;
  respondPermission?(permissionId: string, reply: "once" | "always" | "reject"): Promise<void>;
  close?(): Promise<void> | void;
}

export interface SandboxAgentLike {
  installAgent(agent: string): Promise<unknown>;
  createSession(request: { agent: string; cwd: string; model?: string; mode?: string }): Promise<SandboxSessionLike>;
  dispose(): Promise<void>;
}

export interface LocalProviderOptions {
  host?: string;
  port?: number;
  token?: string;
  binaryPath?: string;
  log?: "inherit" | "silent" | "pipe";
  env?: Record<string, string>;
}

export interface AgentOsHostOptions {
  runtimeId: string;
  runtimeName: string;
  workspaceRoot: string;
  agentWorkspaceRoot?: string;
  sessionCreateTimeoutMs?: number;
  promptTimeoutMs?: number;
  localProvider?: LocalProviderOptions;
  createSandboxAgent?: () => Promise<SandboxAgentLike>;
}

export function createAgentOsHost(options: AgentOsHostOptions): DaemonAgentHost {
  let sandbox: SandboxAgentLike | null = null;
  const installedAgentPackages = new Set<string>();
  const agentsById = new Map<string, AgentIdentity>();
  const sessionsByCacheKey = new Map<string, SandboxSessionLike>();
  const stoppedAgentIds = new Set<string>();
  const runtimeRoot = join(options.workspaceRoot, options.runtimeId);
  const agentsRoot = options.agentWorkspaceRoot ?? join(options.workspaceRoot, "agents");

  async function start() {
    await mkdir(runtimeRoot, {
      recursive: true
    });
    await mkdir(agentsRoot, {
      recursive: true
    });
  }

  function getAgentWorkspaceRoot(agentId: string) {
    return join(agentsRoot, agentId);
  }

  function getConversationRoot(agentId: string, conversationKey?: string) {
    return join(getAgentWorkspaceRoot(agentId), "sessions", conversationKey?.trim() || "default");
  }

  async function writeFileIfMissing(path: string, content: string) {
    try {
      await stat(path);
    } catch {
      await writeFile(path, content, "utf8");
    }
  }

  async function readTextIfExists(path: string) {
    try {
      return await readFile(path, "utf8");
    } catch {
      return "";
    }
  }

  function trimBlock(content: string, maxChars: number) {
    const normalized = content.trim();
    if (!normalized) {
      return "";
    }

    if (normalized.length <= maxChars) {
      return normalized;
    }

    return `${normalized.slice(0, Math.max(0, maxChars - 15)).trimEnd()}\n... [truncated]`;
  }

  async function ensureSandbox() {
    if (!sandbox) {
      sandbox = await (options.createSandboxAgent?.() ?? startLocalSandboxAgent(options.localProvider));
    }

    return sandbox;
  }

  async function writeRuntimeManifest() {
    await writeFile(
      join(runtimeRoot, "runtime.json"),
      `${JSON.stringify(
        {
          runtimeId: options.runtimeId,
          runtimeName: options.runtimeName,
          installedAgentPackages: [...installedAgentPackages].sort()
        },
        null,
        2
      )}\n`,
      "utf8"
    );
  }

  async function writeAgentsManifest() {
    await writeFile(
      join(runtimeRoot, "agents.json"),
      `${JSON.stringify({ agents: [...agentsById.values()] }, null, 2)}\n`,
      "utf8"
    );
  }

  async function writeAgentFiles(agent: AgentIdentity) {
    const agentRoot = getAgentWorkspaceRoot(agent.id);
    const agentPromptMarkdown = `# ${agent.name}\n\n${agent.description}\n`;

    await mkdir(agentRoot, {
      recursive: true
    });
    await writeFile(
      join(agentRoot, "agent.json"),
      `${JSON.stringify(
        {
          ...agent,
          implementationPackage: getAgentImplementationDefinition(agent.implementation).packageName
        },
        null,
        2
      )}\n`,
      "utf8"
    );
    await writeFile(
      join(agentRoot, "AGENTS.md"),
      agentPromptMarkdown,
      "utf8"
    );
    await writeFileIfMissing(
      join(agentRoot, "memory.md"),
      [
        "# User Preferences",
        "",
        "- None recorded yet.",
        "",
        "# Project Context",
        "",
        "- None recorded yet.",
        "",
        "# Long-term Facts",
        "",
        "- None recorded yet.",
        "",
        "# Collaboration Rules",
        "",
        "- None recorded yet.",
        ""
      ].join("\n")
    );
    await writeFileIfMissing(
      join(agentRoot, "worklog.md"),
      [
        "# Worklog",
        "",
        `- ${new Date().toISOString()} Initialized local workspace for ${agent.name}.`,
        ""
      ].join("\n")
    );
    await mkdir(join(agentRoot, "sessions"), {
      recursive: true
    });
    await updateAgentMemorySnapshot(agent);
  }

  async function updateAgentMemorySnapshot(agent: AgentIdentity) {
    const agentRoot = getAgentWorkspaceRoot(agent.id);
    const worklogPath = join(agentRoot, "worklog.md");
    const memoryPath = join(agentRoot, "memory.md");
    const sessionsRoot = join(agentRoot, "sessions");

    const worklog = await readTextIfExists(worklogPath);
    const recentWorklogEntries = worklog
      .split("\n")
      .filter((line) => line.trim().startsWith("- "))
      .slice(-12);

    const conversationSummaries: Array<{ conversationKey: string; updatedAt: number; summary: string }> = [];

    try {
      const entries = await readdir(sessionsRoot, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }

        const summaryPath = join(sessionsRoot, entry.name, "summary.md");
        const summary = trimBlock(await readTextIfExists(summaryPath), 1200);
        if (!summary) {
          continue;
        }

        const summaryStat = await stat(summaryPath).catch(() => null);
        conversationSummaries.push({
          conversationKey: entry.name,
          updatedAt: summaryStat ? summaryStat.mtimeMs : 0,
          summary
        });
      }
    } catch {
      // No session folders yet.
    }

    conversationSummaries.sort((left, right) => right.updatedAt - left.updatedAt);

    await writeFile(
      memoryPath,
      [
        "# Agent Memory",
        "",
        "## Identity",
        "",
        `- Name: ${agent.name}`,
        `- Implementation: ${agent.implementation}`,
        `- Model: ${agent.model}`,
        `- Reasoning effort: ${agent.reasoningEffort}`,
        `- Description: ${agent.description}`,
        "",
        "## Recent Work",
        "",
        ...(recentWorklogEntries.length > 0 ? recentWorklogEntries : ["- No recent work recorded yet."]),
        "",
        "## Conversation Snapshots",
        "",
        ...((conversationSummaries.length > 0
          ? conversationSummaries.slice(0, 6).flatMap((entry) => [
              `### ${entry.conversationKey}`,
              "",
              entry.summary,
              ""
            ])
          : ["- No conversation summaries recorded yet.", ""]) as string[]),
        "## Collaboration Notes",
        "",
        "- Use this file and worklog.md as persistent context before answering questions about prior work.",
        "- Prefer concrete summaries based on recorded worklog and session summaries over claiming no history exists.",
        ""
      ].join("\n"),
      "utf8"
    );
  }

  async function buildPromptWithWorkspaceContext(agent: AgentIdentity, prompt: string, conversationKey?: string) {
    const agentRoot = getAgentWorkspaceRoot(agent.id);
    const currentConversationSummary = conversationKey
      ? await readTextIfExists(join(getConversationRoot(agent.id, conversationKey), "summary.md"))
      : "";
    const profile = await readTextIfExists(join(agentRoot, "AGENTS.md"));
    const memory = await readTextIfExists(join(agentRoot, "memory.md"));
    const worklog = await readTextIfExists(join(agentRoot, "worklog.md"));

    const sections = [
      "# Persistent Agent Context",
      "",
      "Use the following workspace files as durable memory and prior context for this agent.",
      "If the user asks about prior work, recent progress, previous sessions, or preferences, answer from these records first.",
      "",
      "## Agent Profile (AGENTS.md)",
      "",
      trimBlock(profile, 3000) || "(missing)",
      "",
      "## Persistent Memory (memory.md)",
      "",
      trimBlock(memory, 8000) || "(empty)",
      "",
      "## Worklog (worklog.md)",
      "",
      trimBlock(worklog, 6000) || "(empty)",
      ""
    ];

    if (currentConversationSummary.trim()) {
      sections.push("## Current Conversation Summary", "", trimBlock(currentConversationSummary, 3000), "");
    }

    sections.push("## New User Prompt", "", prompt);
    return sections.join("\n");
  }

  async function appendConversationArtifacts(
    agent: AgentIdentity,
    input: { conversationKey?: string; sessionId: string; prompt: string; responseText: string }
  ) {
    const occurredAt = new Date().toISOString();
    const conversationRoot = getConversationRoot(agent.id, input.conversationKey);
    await mkdir(conversationRoot, { recursive: true });

    const transcriptPath = join(conversationRoot, "transcript.ndjson");
    const summaryPath = join(conversationRoot, "summary.md");
    const worklogPath = join(getAgentWorkspaceRoot(agent.id), "worklog.md");

    await appendFile(
      transcriptPath,
      `${JSON.stringify({
        type: "agent_prompt",
        occurredAt,
        conversationKey: input.conversationKey ?? "default",
        sessionId: input.sessionId,
        prompt: input.prompt
      })}\n${JSON.stringify({
        type: "agent_response",
        occurredAt,
        conversationKey: input.conversationKey ?? "default",
        sessionId: input.sessionId,
        response: input.responseText
      })}\n`,
      "utf8"
    );

    await writeFile(
      summaryPath,
      [
        "# Conversation Summary",
        "",
        `- Conversation: ${input.conversationKey ?? "default"}`,
        `- Session: ${input.sessionId}`,
        `- Updated: ${occurredAt}`,
        "",
        "## Latest Prompt",
        "",
        input.prompt || "(empty prompt)",
        "",
        "## Latest Response",
        "",
        input.responseText || "(empty response)",
        ""
      ].join("\n"),
      "utf8"
    );

    await appendFile(
      worklogPath,
      `- ${occurredAt} [${input.conversationKey ?? "default"}] Session ${input.sessionId}: ${truncateForMarkdown(input.responseText || input.prompt)}\n`,
      "utf8"
    );

    await updateAgentMemorySnapshot(agent);
  }

  async function collectWorkspaceFiles(agentId: string): Promise<AgentWorkspaceFileContentDTO[]> {
    const root = getAgentWorkspaceRoot(agentId);
    const files: AgentWorkspaceFileContentDTO[] = [];

    async function walk(relativePath: string) {
      const directoryPath = relativePath ? join(root, relativePath) : root;
      const entries = await readdir(directoryPath, { withFileTypes: true });

      for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
        const nextRelativePath = relativePath ? join(relativePath, entry.name) : entry.name;
        const fullPath = join(root, nextRelativePath);

        if (entry.isDirectory()) {
          await walk(nextRelativePath);
          continue;
        }

        const [content, fileStat] = await Promise.all([readFile(fullPath, "utf8"), stat(fullPath)]);
        files.push({
          path: nextRelativePath,
          kind: "file",
          size: Buffer.byteLength(content, "utf8"),
          updatedAt: fileStat.mtime.toISOString(),
          content
        });
      }
    }

    try {
      await walk("");
    } catch {
      return [];
    }

    return files;
  }

  async function syncAgentFiles() {
    await writeRuntimeManifest();
    await writeAgentsManifest();

    for (const agent of agentsById.values()) {
      await writeAgentFiles(agent);
    }
  }

  function getSessionCacheKey(agentId: string, conversationKey?: string) {
    return `${agentId}::${conversationKey?.trim() || "default"}`;
  }

  async function disposeSessionsForAgent(agentId: string) {
    for (const [cacheKey, session] of sessionsByCacheKey.entries()) {
      if (!cacheKey.startsWith(`${agentId}::`)) {
        continue;
      }

      sessionsByCacheKey.delete(cacheKey);
      await session.close?.();
    }
  }

  async function getSession(agent: AgentIdentity, sessionAgentId: string, conversationKey?: string) {
    const cacheKey = getSessionCacheKey(agent.id, conversationKey);
    const existing = sessionsByCacheKey.get(cacheKey);

    if (existing) {
      console.log("[agent-host] reusing session", {
        agentId: agent.id,
        agentName: agent.name,
        conversationKey: conversationKey ?? "default",
        sessionId: existing.id
      });
      return existing;
    }

    console.log("[agent-host] creating session", {
      agentId: agent.id,
      agentName: agent.name,
      sessionAgentId,
      conversationKey: conversationKey ?? "default",
      model: normalizeAgentModel(agent),
      implementation: agent.implementation
    });
    const created = await withTimeout(
      (await ensureSandbox()).createSession({
        agent: sessionAgentId,
        cwd: getAgentWorkspaceRoot(agent.id),
        model: normalizeAgentModel(agent),
        mode: agent.implementation === "codex" ? "auto" : undefined
      }),
      options.sessionCreateTimeoutMs ?? 30_000,
      `Timed out creating agent session for ${agent.name}.`
    );

    sessionsByCacheKey.set(cacheKey, created);
    console.log("[agent-host] session created", {
      agentId: agent.id,
      agentName: agent.name,
      conversationKey: conversationKey ?? "default",
      sessionId: created.id
    });

    return created;
  }

  return {
    async start() {
      await start();
    },
    async syncAgents(agents) {
      await start();
      const requiredPackages = [...new Set(agents.map((agent) => getAgentOsAgentId(agent)))].sort();

      for (const packageName of requiredPackages) {
        if (installedAgentPackages.has(packageName)) {
          continue;
        }

        await (await ensureSandbox()).installAgent(packageName);
        installedAgentPackages.add(packageName);
      }

      const nextAgentIds = new Set(agents.map((agent) => agent.id));

      for (const existingAgentId of [...agentsById.keys()]) {
        if (nextAgentIds.has(existingAgentId)) {
          continue;
        }

        await disposeSessionsForAgent(existingAgentId);
        agentsById.delete(existingAgentId);
        stoppedAgentIds.delete(existingAgentId);
        await rm(join(runtimeRoot, existingAgentId), {
          force: true,
          recursive: true
        });
        await rm(getAgentWorkspaceRoot(existingAgentId), {
          force: true,
          recursive: true
        });
      }

      agentsById.clear();
      stoppedAgentIds.clear();

      for (const agent of agents) {
        agentsById.set(agent.id, agent);

        if (agent.status === "stopped") {
          stoppedAgentIds.add(agent.id);
        }
      }

      await syncAgentFiles();
    },
    async setAgentStatus(agentId, status) {
      const agent = agentsById.get(agentId);

      if (!agent) {
        return;
      }

      const nextAgent = {
        ...agent,
        status
      };

      agentsById.set(agentId, nextAgent);

      if (status === "stopped") {
        stoppedAgentIds.add(agentId);
      } else {
        stoppedAgentIds.delete(agentId);
      }

      await writeAgentsManifest();
      await writeAgentFiles(nextAgent);
    },
    async restartAgent(agentId, mode) {
      const agent = agentsById.get(agentId);

      if (!agent) {
        return;
      }

      await disposeSessionsForAgent(agentId);
      console.log("[agent-host] restart agent", {
        agentId,
        agentName: agent.name,
        mode: mode ?? "restart"
      });

      const agentRoot = getAgentWorkspaceRoot(agentId);

      if (mode === "full_reset") {
        await rm(agentRoot, {
          force: true,
          recursive: true
        });
        await writeAgentFiles(agent);
      } else if (mode === "reset_session") {
        await rm(join(agentRoot, "sessions"), {
          force: true,
          recursive: true
        });
        await mkdir(join(agentRoot, "sessions"), {
          recursive: true
        });
        await updateAgentMemorySnapshot(agent);
      } else if (mode === "reset_memory") {
        await rm(agentRoot, {
          force: true,
          recursive: true
        });
        await writeAgentFiles(agent);
      }

      await writeFile(
        join(agentRoot, "session.json"),
        `${JSON.stringify(
          {
            restartedAt: new Date().toISOString(),
            mode: mode ?? "restart"
          },
          null,
          2
        )}\n`,
        "utf8"
      );
    },
    async deleteAgent(agentId) {
      console.log("[agent-host] delete agent", {
        agentId,
        agentName: agentsById.get(agentId)?.name ?? null
      });
      await disposeSessionsForAgent(agentId);
      agentsById.delete(agentId);
      stoppedAgentIds.delete(agentId);
      await rm(join(runtimeRoot, agentId), {
        force: true,
        recursive: true
      });
      await rm(getAgentWorkspaceRoot(agentId), {
        force: true,
        recursive: true
      });
      await writeAgentsManifest();
    },
    async run(agent, prompt, runOptions) {
      await start();

      if (stoppedAgentIds.has(agent.id) || agentsById.get(agent.id)?.status === "stopped" || agent.status === "stopped") {
        throw new Error("Agent is stopped.");
      }

      const implementationPackage = getAgentImplementationDefinition(agent.implementation).packageName;
      const sessionAgentId = getAgentOsAgentId(agent);

      if (!installedAgentPackages.has(sessionAgentId)) {
        console.log("[agent-host] installing agent package", {
          agentId: agent.id,
          agentName: agent.name,
          sessionAgentId
        });
        await (await ensureSandbox()).installAgent(sessionAgentId);
        installedAgentPackages.add(sessionAgentId);
      }

      const session = await getSession(agent, sessionAgentId, runOptions?.conversationKey);
      let responseText = "";
      const unsubscribe = session.onEvent?.((event: unknown) => {
        const chunk = extractAgentMessageChunkText(event);

        if (chunk) {
          responseText += chunk;
          console.log("[agent-host] response chunk", {
            agentId: agent.id,
            agentName: agent.name,
            conversationKey: runOptions?.conversationKey ?? "default",
            sessionId: session.id,
            chunkLength: chunk.length,
            totalLength: responseText.length
          });
        }
      });
      const unsubscribePermission = session.onPermissionRequest?.(async (request: { id: string }) => {
        console.log("[agent-host] auto-approving permission", {
          agentId: agent.id,
          agentName: agent.name,
          conversationKey: runOptions?.conversationKey ?? "default",
          sessionId: session.id,
          requestId: request.id
        });
        await session.respondPermission?.(request.id, "always");
      });
      try {
        const contextualPrompt = await buildPromptWithWorkspaceContext(agent, prompt, runOptions?.conversationKey);
        console.log("[agent-host] prompt start", {
          agentId: agent.id,
          agentName: agent.name,
          conversationKey: runOptions?.conversationKey ?? "default",
          sessionId: session.id,
          promptLength: prompt.length
        });
        await withTimeout(
          session.prompt([{ type: "text", text: contextualPrompt }]),
          options.promptTimeoutMs ?? 300_000,
          `Timed out waiting for ${agent.name} to respond.`
        );
        console.log("[agent-host] prompt complete", {
          agentId: agent.id,
          agentName: agent.name,
          conversationKey: runOptions?.conversationKey ?? "default",
          sessionId: session.id,
          responseLength: responseText.length
        });
        await appendConversationArtifacts(agent, {
          conversationKey: runOptions?.conversationKey,
          sessionId: session.id,
          prompt,
          responseText
        });
      } finally {
        unsubscribe?.();
        unsubscribePermission?.();
      }

      return {
        sessionId: session.id,
        implementationPackage,
        responseText
      };
    },
    async listWorkspaceFiles(agentId) {
      const legacyAgentPromptPath = join(getAgentWorkspaceRoot(agentId), "AGENT.md");
      await rm(legacyAgentPromptPath, {
        force: true
      });
      return await collectWorkspaceFiles(agentId);
    },
    async stop() {
      if (sandbox) {
        for (const agentId of [...agentsById.keys()]) {
          await disposeSessionsForAgent(agentId);
        }
        await sandbox.dispose();
        sandbox = null;
      }

      installedAgentPackages.clear();
      agentsById.clear();
      sessionsByCacheKey.clear();
      stoppedAgentIds.clear();
    }
  };
}

function truncateForMarkdown(value: string, maxLength = 140) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "(empty output)";
  }

  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 1)}…`;
}

function extractAgentMessageChunkText(event: unknown): string {
  if (!event || typeof event !== "object") {
    return "";
  }

  const directUpdate = "update" in event ? (event as { update?: unknown }).update : undefined;
  const payload = "payload" in event ? (event as { payload?: unknown }).payload : undefined;
  const payloadParams =
    payload && typeof payload === "object" && "params" in payload ? (payload as { params?: unknown }).params : undefined;
  const update =
    directUpdate ??
    (payloadParams && typeof payloadParams === "object" && "update" in payloadParams
      ? (payloadParams as { update?: unknown }).update
      : undefined);

  if (!update || typeof update !== "object") {
    return "";
  }

  const sessionUpdate = "sessionUpdate" in update ? (update as { sessionUpdate?: unknown }).sessionUpdate : undefined;
  if (sessionUpdate !== "agent_message_chunk") {
    return "";
  }

  const content = "content" in update ? (update as { content?: unknown }).content : undefined;
  if (!content || typeof content !== "object") {
    return "";
  }

  const type = "type" in content ? (content as { type?: unknown }).type : undefined;
  const text = "text" in content ? (content as { text?: unknown }).text : undefined;

  return type === "text" && typeof text === "string" ? text : "";
}

function getAgentOsAgentId(agent: AgentIdentity) {
  return getAgentImplementationDefinition(agent.implementation).packageName;
}

function normalizeAgentModel(agent: Pick<AgentIdentity, "implementation" | "model">) {
  if (agent.implementation !== "claude") {
    return agent.model;
  }

  switch (agent.model) {
    case "claude-sonnet-4.5":
      return "sonnet[1m]";
    case "claude-opus-4.1":
      return "opus[1m]";
    case "claude-haiku-3.5":
      return "haiku";
    case "claude-opus-4.6":
      return "claude-opus-4-6";
    default:
      return agent.model;
  }
}

async function startLocalSandboxAgent(localProviderOptions?: LocalProviderOptions): Promise<SandboxAgentLike> {
  const [{ SandboxAgent }, { local }] = await Promise.all([import("sandbox-agent"), import("sandbox-agent/local")]);

  return await SandboxAgent.start({
    sandbox: local({
      // Claude Code / Codex use the host machine's existing auth state.
      log: "inherit",
      ...(localProviderOptions ?? {})
    })
  });
}

export const createSandboxAgentHost = createAgentOsHost;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return promise;
  }

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);

    void promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}
