import { afterEach, describe, expect, test } from "bun:test";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentIdentity } from "@workpilot/shared";
import { createAgentOsHost } from "./agent-host";

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

describe("agent os host", () => {
  test("installs unique agent-os packages for synced agent implementations", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "workpilot-agent-host-"));
    cleanupPaths.push(workspaceRoot);

    const installCalls: string[] = [];
    const host = createAgentOsHost({
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

    expect(installCalls).toEqual(["claude", "codex"]);

    const runtimeManifest = JSON.parse(await readFile(join(workspaceRoot, "rtm_demo", "runtime.json"), "utf8")) as {
      installedAgentPackages: string[];
    };
    const agentManifest = JSON.parse(await readFile(join(workspaceRoot, "agents", "agt_codex", "agent.json"), "utf8")) as {
      implementationPackage: string;
    };

    expect(runtimeManifest.installedAgentPackages).toEqual(["claude", "codex"]);
    expect(agentManifest.implementationPackage).toBe("codex");
  });

  test("writes the agent profile to AGENTS.md only", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "workpilot-agent-host-"));
    cleanupPaths.push(workspaceRoot);

    const host = createAgentOsHost({
      runtimeId: "rtm_demo",
      runtimeName: "datacenter",
      workspaceRoot,
      createSandboxAgent: async () => ({
        async installAgent() {},
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

    const agent: AgentIdentity = {
      id: "agt_codex",
      runtimeId: "rtm_demo",
      channelId: "dir_admin_coder",
      name: "Nomi",
      description: "You are coding agent named \"Nomi\", you can help people solve complex problems",
      implementation: "codex",
      model: "gpt-5.4",
      reasoningEffort: "high",
      status: "running"
    };

    await host.start();
    await host.syncAgents([agent]);

    const agentsMd = await readFile(join(workspaceRoot, "agents", "agt_codex", "AGENTS.md"), "utf8");

    expect(agentsMd).toContain("Nomi");
    expect(agentsMd).toContain("help people solve complex problems");
    await expect(access(join(workspaceRoot, "agents", "agt_codex", "AGENT.md"))).rejects.toThrow();
  });

  test("creates a session with the agent-os agent id when running a claude agent prompt", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "workpilot-agent-host-"));
    cleanupPaths.push(workspaceRoot);

    const createSessionCalls: Array<{ agent: string; cwd: string; model?: string; mode?: string }> = [];
    const promptCalls: Array<Array<{ type: string; text: string }>> = [];
    const host = createAgentOsHost({
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
        agent: "claude",
        cwd: join(workspaceRoot, "agents", "agt_claude"),
        model: "sonnet[1m]",
        mode: undefined
      }
    ]);
    expect(promptCalls).toHaveLength(1);
    expect(promptCalls[0]?.[0]?.text).toContain("# Persistent Agent Context");
    expect(promptCalls[0]?.[0]?.text).toContain("## Agent Profile (AGENTS.md)");
    expect(promptCalls[0]?.[0]?.text).toContain("Implement the failing test.");
    expect(result).toEqual({
      implementationPackage: "claude",
      responseText: "",
      sessionId: "ses_codex"
    });
  });

  test("normalizes legacy claude opus model ids before creating the session", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "workpilot-agent-host-"));
    cleanupPaths.push(workspaceRoot);

    const createSessionCalls: Array<{ agent: string; cwd: string; model?: string; mode?: string }> = [];
    const host = createAgentOsHost({
      runtimeId: "rtm_demo",
      runtimeName: "datacenter",
      workspaceRoot,
      createSandboxAgent: async () => ({
        async installAgent() {},
        async createSession(request) {
          createSessionCalls.push(request);

          return {
            id: "ses_claude",
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
      id: "agt_claude",
      runtimeId: "rtm_demo",
      channelId: "dir_admin_planner",
      name: "Planner",
      description: "Plans repository changes.",
      implementation: "claude",
      model: "claude-opus-4.6",
      reasoningEffort: "medium",
      status: "running"
    };

    await host.syncAgents([agent]);
    await host.run(agent, "Normalize the model.");

    expect(createSessionCalls[0]?.model).toBe("claude-opus-4-6");
  });

  test("runs codex agents through sandbox-agent codex sessions and reuses the same session", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "workpilot-agent-host-"));
    cleanupPaths.push(workspaceRoot);

    const installCalls: string[] = [];
    const createSessionCalls: Array<{ agent: string; cwd: string; model?: string; mode?: string }> = [];
    const promptCalls: string[] = [];
    const host = createAgentOsHost({
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
              const promptIndex = promptCalls.length;
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
                          text: promptIndex === 0 ? "First codex reply" : "Second codex reply"
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
      implementationPackage: "codex",
      responseText: "First codex reply",
      sessionId: "ses_codex"
    });
    await expect(host.run(agent, "Second prompt")).resolves.toEqual({
      implementationPackage: "codex",
      responseText: "Second codex reply",
      sessionId: "ses_codex"
    });

    expect(installCalls).toEqual(["codex"]);
    expect(createSessionCalls).toEqual([
      {
        cwd: join(workspaceRoot, "agents", "agt_codex"),
        model: "gpt-5.4",
        mode: "auto",
        agent: "codex"
      }
    ]);
    expect(promptCalls).toHaveLength(2);
    expect(promptCalls[0]).toContain("First prompt");
    expect(promptCalls[1]).toContain("Second prompt");
  });

  test("refuses to run a stopped codex agent until it is started again", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "workpilot-agent-host-"));
    cleanupPaths.push(workspaceRoot);

    const host = createAgentOsHost({
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
      implementationPackage: "codex",
      responseText: "",
      sessionId: "ses_codex"
    });
  });

  test("deletes local agent state when an agent is removed", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "workpilot-agent-host-"));
    cleanupPaths.push(workspaceRoot);

    const host = createAgentOsHost({
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

    await expect(access(join(workspaceRoot, "agents", agent.id))).rejects.toThrow();
  });

  test("captures streamed agent output and reuses the same session for follow-up prompts", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "workpilot-agent-host-"));
    cleanupPaths.push(workspaceRoot);

    const createSessionCalls: Array<{ agent: string; cwd: string; model?: string; mode?: string }> = [];
    const promptCalls: string[] = [];
    const host = createAgentOsHost({
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
              const promptIndex = promptCalls.length;
              promptCalls.push(text);

              const chunks = promptIndex === 0 ? ["First", " answer"] : ["Second", " answer"];

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
        cwd: join(workspaceRoot, "agents", "agt_codex"),
        model: "gpt-5.4",
        mode: "auto"
      }
    ]);
    expect(promptCalls).toHaveLength(2);
    expect(promptCalls[0]).toContain("First prompt");
    expect(promptCalls[1]).toContain("Second prompt");
  });

  test("separates sessions for the same agent across different conversation scopes", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "workpilot-agent-host-"));
    cleanupPaths.push(workspaceRoot);

    const createSessionCalls: Array<{ agent: string; cwd: string; model?: string; mode?: string }> = [];
    const promptCalls: Array<{ sessionId: string; prompt: string }> = [];
    let sessionCount = 0;
    const host = createAgentOsHost({
      runtimeId: "rtm_demo",
      runtimeName: "datacenter",
      workspaceRoot,
      createSandboxAgent: async () => ({
        async installAgent() {},
        async createSession(request) {
          createSessionCalls.push(request);
          sessionCount += 1;
          const sessionId = `ses_${sessionCount}`;

          return {
            id: sessionId,
            async prompt(prompt) {
              const text = (prompt as Array<{ type: string; text: string }>)[0]?.text ?? "";
              promptCalls.push({
                sessionId,
                prompt: text
              });

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

    await expect(host.run(agent, "Direct 1", { conversationKey: "channel:dir_admin_coder" })).resolves.toMatchObject({
      sessionId: "ses_1"
    });
    await expect(host.run(agent, "Direct 2", { conversationKey: "channel:dir_admin_coder" })).resolves.toMatchObject({
      sessionId: "ses_1"
    });
    await expect(host.run(agent, "Group 1", { conversationKey: "channel:grp_release" })).resolves.toMatchObject({
      sessionId: "ses_2"
    });

    expect(createSessionCalls).toEqual([
      {
        agent: "codex",
        cwd: join(workspaceRoot, "agents", "agt_codex"),
        model: "gpt-5.4",
        mode: "auto"
      },
      {
        agent: "codex",
        cwd: join(workspaceRoot, "agents", "agt_codex"),
        model: "gpt-5.4",
        mode: "auto"
      }
    ]);
    expect(promptCalls).toEqual([
      { sessionId: "ses_1", prompt: expect.stringContaining("Direct 1") },
      { sessionId: "ses_1", prompt: expect.stringContaining("Direct 2") },
      { sessionId: "ses_2", prompt: expect.stringContaining("Group 1") }
    ]);
  });

  test("injects prior worklog and session summaries into later prompts and refreshes memory.md", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "workpilot-agent-host-"));
    cleanupPaths.push(workspaceRoot);

    const promptCalls: string[] = [];
    let responseCount = 0;
    const host = createAgentOsHost({
      runtimeId: "rtm_demo",
      runtimeName: "datacenter",
      workspaceRoot,
      createSandboxAgent: async () => ({
        async installAgent() {},
        async createSession() {
          const listeners = new Set<(event: unknown) => void>();

          return {
            id: "ses_memory",
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
              responseCount += 1;

              for (const listener of listeners) {
                listener({
                  payload: {
                    method: "session/update",
                    params: {
                      update: {
                        sessionUpdate: "agent_message_chunk",
                        content: {
                          type: "text",
                          text: responseCount === 1 ? "Finished fixing deploy pipeline." : "Recent work summarized."
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
      id: "agt_memory",
      runtimeId: "rtm_demo",
      channelId: "dir_admin_memory",
      name: "Historian",
      description: "Tracks previous work and summarizes recent progress.",
      implementation: "claude",
      model: "claude-sonnet-4.5",
      reasoningEffort: "medium",
      status: "running"
    };

    await host.syncAgents([agent]);
    await host.run(agent, "Fix the deploy pipeline.", { conversationKey: "channel:dir_admin_memory" });
    await host.run(agent, "总结一下你最近的工作内容", { conversationKey: "channel:dir_admin_memory" });

    expect(promptCalls[1]).toContain("Finished fixing deploy pipeline.");
    expect(promptCalls[1]).toContain("## Current Conversation Summary");
    expect(promptCalls[1]).toContain("## Worklog (worklog.md)");

    const memoryMd = await readFile(join(workspaceRoot, "agents", "agt_memory", "memory.md"), "utf8");
    expect(memoryMd).toContain("Finished fixing deploy pipeline.");
    expect(memoryMd).toContain("channel:dir_admin_memory");
  });

  test("restart clears every cached session for the agent", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "workpilot-agent-host-"));
    cleanupPaths.push(workspaceRoot);

    const closedSessionIds: string[] = [];
    let sessionCount = 0;
    const host = createAgentOsHost({
      runtimeId: "rtm_demo",
      runtimeName: "datacenter",
      workspaceRoot,
      createSandboxAgent: async () => ({
        async installAgent() {},
        async createSession() {
          sessionCount += 1;
          const sessionId = `ses_${sessionCount}`;

          return {
            id: sessionId,
            async prompt() {
              return {
                stopReason: "end_turn"
              };
            },
            async close() {
              closedSessionIds.push(sessionId);
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
    await host.run(agent, "Direct", { conversationKey: "channel:dir_admin_coder" });
    await host.run(agent, "Group", { conversationKey: "channel:grp_release" });

    await host.restartAgent(agent.id, "reset_session");

    expect(closedSessionIds.sort()).toEqual(["ses_1", "ses_2"]);
  });

  test("fails fast when sandbox-agent session creation hangs", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "workpilot-agent-host-"));
    cleanupPaths.push(workspaceRoot);

    const host = createAgentOsHost({
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

    await expect(host.run(agent, "Hello")).rejects.toThrow("Timed out creating agent session for Coder.");
  });
});
