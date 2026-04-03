export interface ComposerAttachmentDraft {
  id: string;
  name: string;
  mediaType: string;
  size: number;
  kind: "image" | "file";
  dataUrl: string;
  previewUrl: string | null;
}

export async function createComposerAttachmentDraft(file: File, createId = defaultCreateId): Promise<ComposerAttachmentDraft> {
  const dataUrl = await readFileAsDataUrl(file);
  const kind = file.type.startsWith("image/") ? "image" : "file";

  return {
    id: createId(),
    name: file.name,
    mediaType: file.type || "application/octet-stream",
    size: file.size,
    kind,
    dataUrl,
    previewUrl: kind === "image" ? dataUrl : null
  };
}

export async function createComposerAttachmentDrafts(files: File[], createId = defaultCreateId) {
  return Promise.all(files.map((file) => createComposerAttachmentDraft(file, createId)));
}

export async function createComposerAttachmentDraftsFromFileList(
  fileList: FileList | null,
  createId = defaultCreateId
) {
  return createComposerAttachmentDrafts(fileList ? Array.from(fileList) : [], createId);
}

async function readFileAsDataUrl(file: File) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  const base64 = btoa(binary);
  const mediaType = file.type || "application/octet-stream";

  return `data:${mediaType};base64,${base64}`;
}

function defaultCreateId() {
  return `att_local_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}
