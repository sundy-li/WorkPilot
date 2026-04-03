import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface DaemonState {
  version: 1;
  controlPlaneUrl: string;
  runtimeId: string;
  runtimeName: string;
  runtimeKey: string;
  credentialToken: string;
}

export interface DaemonStateStore {
  load(): Promise<DaemonState | null>;
  save(state: DaemonState): Promise<void>;
}

export function createFileDaemonStateStore(statePath: string): DaemonStateStore {
  return {
    async load() {
      try {
        const raw = await readFile(statePath, "utf8");
        return JSON.parse(raw) as DaemonState;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return null;
        }

        throw error;
      }
    },
    async save(state) {
      await mkdir(dirname(statePath), {
        recursive: true
      });
      await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    }
  };
}
