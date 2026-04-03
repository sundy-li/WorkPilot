declare module "sandbox-agent" {
  export class SandboxAgent {
    static start(options: { sandbox: unknown }): Promise<{
      installAgent(agent: string): Promise<unknown>;
      createSession(request: { agent: string; cwd: string; model?: string; mode?: string }): Promise<{
        id: string;
        prompt(prompt: Array<{ type: "text"; text: string }>): Promise<unknown>;
        onEvent?(listener: (event: unknown) => void): (() => void) | void;
        onPermissionRequest?(listener: (request: { id: string }) => void | Promise<void>): (() => void) | void;
        respondPermission?(permissionId: string, reply: "once" | "always" | "reject"): Promise<void>;
        close?(): Promise<void> | void;
      }>;
      dispose(): Promise<void>;
    }>;
  }
}

declare module "sandbox-agent/local" {
  export function local(options?: Record<string, unknown>): unknown;
}
