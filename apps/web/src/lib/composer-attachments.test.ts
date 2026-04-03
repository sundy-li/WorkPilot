import { describe, expect, test } from "bun:test";
import { createComposerAttachmentDraft, createComposerAttachmentDraftsFromFileList } from "./composer-attachments";

describe("composer attachments", () => {
  test("creates an image draft with a thumbnail preview", async () => {
    const file = new File([new Uint8Array([137, 80, 78, 71])], "incident.png", {
      type: "image/png"
    });

    const draft = await createComposerAttachmentDraft(file, () => "att_local");

    expect(draft.id).toBe("att_local");
    expect(draft.kind).toBe("image");
    expect(draft.previewUrl).toContain("data:image/png;base64,");
  });

  test("creates a file draft without an image preview", async () => {
    const file = new File(["build failed"], "trace.log", {
      type: "text/plain"
    });

    const draft = await createComposerAttachmentDraft(file, () => "att_local");

    expect(draft.kind).toBe("file");
    expect(draft.previewUrl).toBeNull();
    expect(draft.dataUrl).toContain("data:text/plain");
  });

  test("creates drafts from a file list for local resource picking", async () => {
    const image = new File([new Uint8Array([137, 80, 78, 71])], "incident.png", {
      type: "image/png"
    });
    const log = new File(["build failed"], "trace.log", {
      type: "text/plain"
    });
    const files = [image, log];
    const fileList = {
      0: image,
      1: log,
      length: 2,
      item(index: number) {
        return files[index] ?? null;
      }
    } as unknown as FileList;

    const drafts = await createComposerAttachmentDraftsFromFileList(fileList, () => "att_shared");

    expect(drafts).toHaveLength(2);
    expect(drafts[0]?.name).toBe("incident.png");
    expect(drafts[1]?.name).toBe("trace.log");
  });
});
