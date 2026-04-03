import { describe, expect, test } from "bun:test";
import { getMessageAttachments } from "./message-attachments";

describe("message attachments", () => {
  test("returns an empty array for non-array attachment payloads", () => {
    expect(getMessageAttachments(undefined)).toEqual([]);
    expect(getMessageAttachments(null)).toEqual([]);
    expect(getMessageAttachments({ id: "att_1" })).toEqual([]);
    expect(getMessageAttachments("oops")).toEqual([]);
  });

  test("returns the original attachments when the payload is already an array", () => {
    const attachments = [
      {
        id: "att_1",
        name: "trace.png",
        mediaType: "image/png",
        size: 1234,
        kind: "image" as const,
        dataUrl: "data:image/png;base64,abc"
      }
    ];

    expect(getMessageAttachments(attachments)).toEqual(attachments);
  });
});
