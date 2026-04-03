interface AutoScrollInput {
  previousCount: number;
  nextCount: number;
}

export function shouldAutoScrollToLatest(input: AutoScrollInput) {
  return input.nextCount > input.previousCount;
}
