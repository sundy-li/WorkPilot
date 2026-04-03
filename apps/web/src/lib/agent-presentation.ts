export function formatAgentSidebarMeta(runtimeName: string, implementationLabel: string) {
  return `${runtimeName} · ${implementationLabel}`;
}

export function getPublicImplementationSummary(definition: {
  label: string;
  notes: string;
  packageName: string;
}) {
  return {
    title: definition.label,
    description: definition.notes
  };
}
