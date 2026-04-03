import { afterEach, describe, expect, test } from "bun:test";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentIdentity } from "@workpilot/shared";
import { createSandboxAgentHost } from "./agent-host";

const cleanupPaths: string[] = [];

afterEach(async () => {
  while (cleanupPaths.length > 0) {
    const path = cleanupPaths.pop();

    if (path) {
      await rm(path, {
        force: true,
        recursive: true
      });
    }
  }
});

describe("sandbox agent host", () => {
  test("installs unique agent-os packages for synced agent implementations", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "workpilot-agent-host-"));
    cleanupPaths.push(workspaceRoot);

    const installCalls: string[] = [];
    const host = createSandboxAgentHost({
      runtimeId: "rtm_demo",
      runtimeName: "datacenter",
      workspaceRoot,
      createSandboxAgent: async () => ({
        async installAgent(agent) {
          installCalls.push(agent);
        },
        async createSession() {
          return {
            id: "ses_unused",
            async prompt() {
              return {
                stopReason: "end_turn"
              };
            }
          };
        },
        async dispose() {}
      })
    });

    const agents: AgentIdentity[] = [
      {
        id: "agt_codex",
        runtimeId: "rtm_demo",
        channelId: "dir_admin_coder",
        name: "Coder",
        description: "Writes repository changes.",
        implementation: "codex",
        model: "gpt-5.4",
        reasoningEffort: "high",
        status: "running"
      },
      {
        id: "agt_claude",
        runtimeId: "rtm_demo",
        channelId: "dir_admin_planner",
        name: "Planner",
        description: "Plans and scopes work.",
        implementation: "claude",
        model: "claude-sonnet-4.5",
        reasoningEffort: "medium",
        status: "running"
      },
      {
        id: "agt_codex_2",
        runtimeId: "rtm_demo",
        channelId: "dir_admin_reviewer",
        name: "Reviewer",
        description: "Reviews code changes.",
        implementation: "codex",
        model: "gpt-5",
        reasoningEffort: "medium",
        status: "running"
      }
    ];

    await host.start();
    await host.syncAgents(agents);
    await host.syncAgents(agents);

    expect(installCalls).toEqual(["@rivet-dev/agent-os-claude", "codex"]);

    const runtimeManifest = JSON.parse(await readFile(join(workspaceRoot, "rtm_demo", "runtime.json"), "utf8")) as {
      installedAgentPackages: string[];
    };
    const agentManifest = JSON.parse(await readFile(join(workspaceRoot, "rtm_demo", "agt_codex", "agent.json"), "utf8")) as {
      implementationPackage: string;
    };

    expect(runtimeManifest.installedAgentPackages).toEqual(["@rivet-dev/agent-os-claude", "codex"]);
    expect(agentManifest.implementationPackage).toBe("@rivet-dev/agent-os-codex-agent");
  });

  test("creates a session with the implementation-specific package when running a non-codex agent prompt", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "workpilot-agent-host-"));
    cleanupPaths.push(workspaceRoot);

    const createSessionCalls: Array<{ agent: string; cwd: string; model?: string; mode?: string }> = [];
    const promptCalls: Array<Array<{ type: string; text: string }>> = [];
    const host = createSandboxAgentHost({
      runtimeId: "rtm_demo",
      runtimeName: "datacenter",
      workspaceRoot,
      createSandboxAgent: async () => ({
        async installAgent() {},
        async createSession(request) {
          createSessionCalls.push(request);

          return {
            id: "ses_codex",
            async prompt(prompt) {
              promptCalls.push(prompt as Array<{ type: string; text: string }>);

              return {
                stopReason: "end_turn"
              };
            }
          };
        },
        async dispose() {}
      })
    });

    const agent: AgentIdentity = {
      id: "agt_claude",
      runtimeId: "rtm_demo",
      channelId: "dir_admin_planner",
      name: "Planner",
      description: "Plans repository changes.",
      implementation: "claude",
      model: "claude-sonnet-4.5",
      reasoningEffort: "medium",
      status: "running"
    };

    await host.syncAgents([agent]);
    const result = await host.run(agent, "Implement the failing test.");

    expect(createSessionCalls).toEqual([
      {
        agent: "@rivet-dev/agent-os-claude",
        cwd: join(workspaceRoot, "rtm_demo", "agt_claude"),
        model: "claude-sonnet-4.5",
        mode: undefined
      }
    ]);
    expect(promptCalls).toEqual([[{ type: "text", text: "Implement the failing test." }]]);
    expect(result).toEqual({
      implementationPackage: "@rivet-dev/agent-os-claude",
      responseText: "",
      sessionId: "ses_codex"
    });
  });

  test("runs codex agents through sandbox-agent codex sessions and reuses the same session", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "workpilot-agent-host-"));
    cleanupPaths.push(workspaceRoot);

    const installCalls: string[] = [];
    const createSessionCalls: Array<{ agent: string; cwd: string; model?: string; mode?: string }> = [];
    const promptCalls: string[] = [];
    const host = createSandboxAgentHost({
      runtimeId: "rtm_demo",
      runtimeName: "datacenter",
      workspaceRoot,
      createSandboxAgent: async () => ({
        async installAgent(agent) {
          installCalls.push(agent);
        },
        async createSession(request) {
          createSessionCalls.push(request);
          const listeners = new Set<(event: unknown) => void>();

          return {
            id: "ses_codex",
            onEvent(listener) {
              listeners.add(listener);
              return () => listeners.delete(listener);
            },
            onPermissionRequest() {
              return () => {};
            },
            async respondPermission() {},
            async prompt(prompt) {
              const text = (prompt as Array<{ type: string; text: string }>)[0]?.text ?? "";
              promptCalls.push(text);

              for (const listener of listeners) {
                listener({
                  payload: {
                    method: "session/update",
                    params: {
                      update: {
                        sessionUpdate: "agent_message_chunk",
                        content: {
                          type: "text",
                          text: text === "First prompt" ? "First codex reply" : "Second codex reply"
                        }
                      }
                    }
                  }
                });
              }

              return {
                stopReason: "end_turn"
              };
            }
          };
        },
        async dispose() {}
      })
    });

    const agent: AgentIdentity = {
      id: "agt_codex",
      runtimeId: "rtm_demo",
      channelId: "dir_admin_coder",
      name: "Coder",
      description: "Writes repository changes.",
      implementation: "codex",
      model: "gpt-5.4",
      reasoningEffort: "high",
      status: "running"
    };

    await host.syncAgents([agent]);

    await expect(host.run(agent, "First prompt")).resolves.toEqual({
      implementationPackage: "@rivet-dev/agent-os-codex-agent",
      responseText: "First codex reply",
      sessionId: "ses_codex"
    });
    await expect(host.run(agent, "Second prompt")).resolves.toEqual({
      implementationPackage: "@rivet-dev/agent-os-codex-agent",
      responseText: "Second codex reply",
      sessionId: "ses_codex"
    });

    expect(installCalls).toEqual(["codex"]);
    expect(createSessionCalls).toEqual([
      {
        cwd: join(workspaceRoot, "rtm_demo", "agt_codex"),
        model: "gpt-5.4",
        mode: "auto",
        agent: "codex"
      }
    ]);
    expect(promptCalls).toEqual(["First prompt", "Second prompt"]);
  });

  test("refuses to run a stopped codex agent until it is started again", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "workpilot-agent-host-"));
    cleanupPaths.push(workspaceRoot);

    const host = createSandboxAgentHost({
      runtimeId: "rtm_demo",
      runtimeName: "datacenter",
      workspaceRoot,
      createSandboxAgent: async () => ({
        async installAgent() {},
        async createSession() {
          return {
            id: "ses_codex",
            onPermissionRequest() {
              return () => {};
            },
            async respondPermission() {},
            async prompt() {
              return {
                stopReason: "end_turn"
              };
            }
          };
        },
        async dispose() {}
      })
    });

    const agent: AgentIdentity = {
      id: "agt_codex",
      runtimeId: "rtm_demo",
      channelId: "dir_admin_coder",
      name: "Coder",
      description: "Writes repository changes.",
      implementation: "codex",
      model: "gpt-5.4",
      reasoningEffort: "high",
      status: "stopped"
    };

    await host.syncAgents([agent]);

    await expect(host.run(agent, "Implement the failing test.")).rejects.toThrow("Agent is stopped.");

    await host.setAgentStatus(agent.id, "running");

    await expect(host.run({ ...agent, status: "running" }, "Implement the failing test.")).resolves.toEqual({
      implementationPackage: "@rivet-dev/agent-os-codex-agent",
      responseText: "",
      sessionId: "ses_codex"
    });
  });

  test("deletes local agent state when an agent is removed", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "workpilot-agent-host-"));
    cleanupPaths.push(workspaceRoot);

    const host = createSandboxAgentHost({
      runtimeId: "rtm_demo",
      runtimeName: "datacenter",
      workspaceRoot,
      createSandboxAgent: async () => ({
        async installAgent() {},
        async createSession() {
          return {
            id: "ses_codex",
            async prompt() {
              return {
                stopReason: "end_turn"
              };
            }
          };
        },
        async dispose() {}
      })
    });

    const agent: AgentIdentity = {
      id: "agt_codex",
      runtimeId: "rtm_demo",
      channelId: "dir_admin_coder",
      name: "Coder",
      description: "Writes repository changes.",
      implementation: "codex",
      model: "gpt-5.4",
      reasoningEffort: "high",
      status: "running"
    };

    await host.syncAgents([agent]);
    await host.deleteAgent(agent.id);

    await expect(access(join(workspaceRoot, "rtm_demo", agent.id))).rejects.toThrow();
  });

  test("captures streamed agent output and reuses the same session for follow-up prompts", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "workpilot-agent-host-"));
    cleanupPaths.push(workspaceRoot);

    const createSessionCalls: Array<{ agent: string; cwd: string; model?: string; mode?: string }> = [];
    const promptCalls: string[] = [];
    const host = createSandboxAgentHost({
      runtimeId: "rtm_demo",
      runtimeName: "datacenter",
      workspaceRoot,
      createSandboxAgent: async () => ({
        async installAgent() {},
        async createSession(request) {
          createSessionCalls.push(request);
          const listeners = new Set<(event: unknown) => void>();

          return {
            id: "ses_codex",
            onEvent(listener) {
              listeners.add(listener);
              return () => {
                listeners.delete(listener);
              };
            },
            async prompt(prompt) {
              const text = (prompt as Array<{ type: string; text: string }>)[0]?.text ?? "";
              promptCalls.push(text);

              const chunks =
                text === "First prompt"
                  ? ["First", " answer"]
                  : ["Second", " answer"];

              for (const chunk of chunks) {
                for (const listener of listeners) {
                  listener({
                    sessionId: "ses_codex",
                    update: {
                      sessionUpdate: "agent_message_chunk",
                      content: {
                        type: "text",
                        text: chunk
                      }
                    }
                  });
                }
              }

              return {
                stopReason: "end_turn"
              };
            }
          };
        },
        async dispose() {}
      })
    });

    const agent: AgentIdentity = {
      id: "agt_codex",
      runtimeId: "rtm_demo",
      channelId: "dir_admin_coder",
      name: "Coder",
      description: "Writes repository changes.",
      implementation: "codex",
      model: "gpt-5.4",
      reasoningEffort: "high",
      status: "running"
    };

    await host.syncAgents([agent]);

    await expect(host.run(agent, "First prompt")).resolves.toMatchObject({
      sessionId: "ses_codex",
      responseText: "First answer"
    });
    await expect(host.run(agent, "Second prompt")).resolves.toMatchObject({
      sessionId: "ses_codex",
      responseText: "Second answer"
    });

    expect(createSessionCalls).toEqual([
      {
        agent: "codex",
        cwd: join(workspaceRoot, "rtm_demo", "agt_codex"),
        model: "gpt-5.4",
        mode: "auto"
      }
    ]);
    expect(promptCalls).toEqual(["First prompt", "Second prompt"]);
  });

  test("fails fast when sandbox-agent session creation hangs", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "workpilot-agent-host-"));
    cleanupPaths.push(workspaceRoot);

    const host = createSandboxAgentHost({
      runtimeId: "rtm_demo",
      runtimeName: "datacenter",
      workspaceRoot,
      sessionCreateTimeoutMs: 25,
      createSandboxAgent: async () => ({
        async installAgent() {},
        async createSession() {
          return await new Promise(() => {});
        },
        async dispose() {}
      })
    });

    const agent: AgentIdentity = {
      id: "agt_codex",
      runtimeId: "rtm_demo",
      channelId: "dir_admin_coder",
      name: "Coder",
      description: "Writes repository changes.",
      implementation: "codex",
      model: "gpt-5.4",
      reasoningEffort: "high",
      status: "running"
    };

    await host.syncAgents([agent]);

    await expect(host.run(agent, "Hello")).rejects.toThrow("Timed out creating sandbox-agent session for Coder.");
  });
});
