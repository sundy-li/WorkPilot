import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getAgentImplementationDefinition, type AgentIdentity } from "@workpilot/shared";

export interface DaemonAgentHost {
  start(): Promise<void>;
  syncAgents(agents: AgentIdentity[]): Promise<void>;
  setAgentStatus(agentId: string, status: AgentIdentity["status"]): Promise<void>;
  restartAgent(agentId: string, mode: "restart" | "reset_session" | "full_reset" | null): Promise<void>;
  deleteAgent(agentId: string): Promise<void>;
  run(agent: AgentIdentity, prompt: string): Promise<{
    sessionId: string;
    implementationPackage: string;
    responseText: string;
  }>;
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

export interface SandboxAgentHostOptions {
  runtimeId: string;
  runtimeName: string;
  workspaceRoot: string;
  sessionCreateTimeoutMs?: number;
  promptTimeoutMs?: number;
  localProvider?: LocalProviderOptions;
  createSandboxAgent?: () => Promise<SandboxAgentLike>;
}

export function createSandboxAgentHost(options: SandboxAgentHostOptions): DaemonAgentHost {
  let sandbox: SandboxAgentLike | null = null;
  const installedAgentPackages = new Set<string>();
  const agentsById = new Map<string, AgentIdentity>();
  const sessionsByAgentId = new Map<string, SandboxSessionLike>();
  const stoppedAgentIds = new Set<string>();
  const runtimeRoot = join(options.workspaceRoot, options.runtimeId);

  async function start() {
    await mkdir(runtimeRoot, {
      recursive: true
    });
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
    const agentRoot = join(runtimeRoot, agent.id);
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
      join(agentRoot, "AGENT.md"),
      agentPromptMarkdown,
      "utf8"
    );
    await writeFile(
      join(agentRoot, "AGENTS.md"),
      agentPromptMarkdown,
      "utf8"
    );
  }

  async function syncAgentFiles() {
    await writeRuntimeManifest();
    await writeAgentsManifest();

    for (const agent of agentsById.values()) {
      await writeAgentFiles(agent);
    }
  }

  async function disposeSession(agentId: string) {
    const session = sessionsByAgentId.get(agentId);

    if (!session) {
      return;
    }

    sessionsByAgentId.delete(agentId);
    await session.close?.();
  }

  async function getSession(agent: AgentIdentity, sessionAgentId: string) {
    const existing = sessionsByAgentId.get(agent.id);

    if (existing) {
      console.log("[agent-host] reusing session", {
        agentId: agent.id,
        agentName: agent.name,
        sessionId: existing.id
      });
      return existing;
    }

    console.log("[agent-host] creating session", {
      agentId: agent.id,
      agentName: agent.name,
      sessionAgentId,
      model: agent.model,
      implementation: agent.implementation
    });
    const created = await withTimeout(
      (await ensureSandbox()).createSession({
        agent: sessionAgentId,
        cwd: join(runtimeRoot, agent.id),
        model: agent.model,
        mode: agent.implementation === "codex" ? "auto" : undefined
      }),
      options.sessionCreateTimeoutMs ?? 30_000,
      `Timed out creating sandbox-agent session for ${agent.name}.`
    );

    sessionsByAgentId.set(agent.id, created);
    console.log("[agent-host] session created", {
      agentId: agent.id,
      agentName: agent.name,
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
      const requiredPackages = [...new Set(agents.map((agent) => getSessionAgentId(agent)))].sort();

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

        await disposeSession(existingAgentId);
        agentsById.delete(existingAgentId);
        stoppedAgentIds.delete(existingAgentId);
        await rm(join(runtimeRoot, existingAgentId), {
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

      await disposeSession(agentId);
      console.log("[agent-host] restart agent", {
        agentId,
        agentName: agent.name,
        mode: mode ?? "restart"
      });

      const agentRoot = join(runtimeRoot, agentId);

      if (mode === "full_reset") {
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
      await disposeSession(agentId);
      agentsById.delete(agentId);
      stoppedAgentIds.delete(agentId);
      await rm(join(runtimeRoot, agentId), {
        force: true,
        recursive: true
      });
      await writeAgentsManifest();
    },
    async run(agent, prompt) {
      await start();

      if (stoppedAgentIds.has(agent.id) || agentsById.get(agent.id)?.status === "stopped" || agent.status === "stopped") {
        throw new Error("Agent is stopped.");
      }

      const implementationPackage = getAgentImplementationDefinition(agent.implementation).packageName;
      const sessionAgentId = getSessionAgentId(agent);

      if (!installedAgentPackages.has(sessionAgentId)) {
        console.log("[agent-host] installing agent package", {
          agentId: agent.id,
          agentName: agent.name,
          sessionAgentId
        });
        await (await ensureSandbox()).installAgent(sessionAgentId);
        installedAgentPackages.add(sessionAgentId);
      }

      const session = await getSession(agent, sessionAgentId);
      let responseText = "";
      const unsubscribe = session.onEvent?.((event: unknown) => {
        const chunk = extractAgentMessageChunkText(event);

        if (chunk) {
          responseText += chunk;
          console.log("[agent-host] response chunk", {
            agentId: agent.id,
            agentName: agent.name,
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
          sessionId: session.id,
          requestId: request.id
        });
        await session.respondPermission?.(request.id, "always");
      });
      try {
        console.log("[agent-host] prompt start", {
          agentId: agent.id,
          agentName: agent.name,
          sessionId: session.id,
          promptLength: prompt.length
        });
        await withTimeout(
          session.prompt([{ type: "text", text: prompt }]),
          options.promptTimeoutMs ?? 300_000,
          `Timed out waiting for ${agent.name} to respond.`
        );
        console.log("[agent-host] prompt complete", {
          agentId: agent.id,
          agentName: agent.name,
          sessionId: session.id,
          responseLength: responseText.length
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
    async stop() {
      if (sandbox) {
        for (const agentId of [...sessionsByAgentId.keys()]) {
          await disposeSession(agentId);
        }
        await sandbox.dispose();
        sandbox = null;
      }

      installedAgentPackages.clear();
      agentsById.clear();
      sessionsByAgentId.clear();
      stoppedAgentIds.clear();
    }
  };
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

function getSessionAgentId(agent: AgentIdentity) {
  return agent.implementation === "codex" ? "codex" : getAgentImplementationDefinition(agent.implementation).packageName;
}

async function startLocalSandboxAgent(localProviderOptions?: LocalProviderOptions): Promise<SandboxAgentLike> {
  const [{ SandboxAgent }, { local }] = await Promise.all([import("sandbox-agent"), import("sandbox-agent/local")]);

  return await SandboxAgent.start({
    sandbox: local({
      log: "inherit",
      ...(localProviderOptions ?? {})
    })
  });
}

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
