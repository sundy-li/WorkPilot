import { describe, expect, test } from "bun:test";
import { getRuntimePresenceDetail } from "./runtime-presence";

describe("runtime presence detail", () => {
  test("describes recent online heartbeats", () => {
    expect(
      getRuntimePresenceDetail(
        {
          id: "rtm_demo",
          name: "demo",
          status: "online",
          lastHeartbeatAt: "2025-04-04T12:00:45.000Z"
        },
        {
          now: "2025-04-04T12:01:00.000Z"
        }
      )
    ).toBe("Last heartbeat 15s ago");
  });

  test("describes offline duration after the heartbeat timeout", () => {
    expect(
      getRuntimePresenceDetail(
        {
          id: "rtm_demo",
          name: "demo",
          status: "offline",
          lastHeartbeatAt: "2025-04-04T12:00:00.000Z"
        },
        {
          now: "2025-04-04T12:02:05.000Z"
        }
      )
    ).toBe("Offline for 1m 5s");
  });

  test("shows pending runtimes as waiting for the first heartbeat", () => {
    expect(
      getRuntimePresenceDetail({
        id: "rtm_demo",
        name: "demo",
        status: "pending",
        lastHeartbeatAt: null
      })
    ).toBe("Awaiting first heartbeat");
  });
});
