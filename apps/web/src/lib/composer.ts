interface ComposerKeypressInput {
  key: string;
  shiftKey: boolean;
  isComposing: boolean;
}

export function shouldSendMessageFromKeypress(input: ComposerKeypressInput) {
  return input.key === "Enter" && !input.shiftKey && !input.isComposing;
}

export function shouldSubmitInlineDraftFromKeypress(input: Pick<ComposerKeypressInput, "key" | "isComposing">) {
  return input.key === "Enter" && !input.isComposing;
}
