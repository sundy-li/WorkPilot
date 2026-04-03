export type ThemeMode = "core" | "mint" | "amber" | "rose";

interface ThemeDocumentLike {
  documentElement: {
    dataset: {
      themeMode?: string;
    };
  };
}

export interface ThemeModeOption {
  id: ThemeMode;
  label: string;
  accent: string;
  surface: string;
}

export const THEME_MODE_STORAGE_KEY = "workpilot-theme-mode";

export const themeModes: ThemeModeOption[] = [
  { id: "core", label: "Core", accent: "#4f46e5", surface: "#eef2ff" },
  { id: "mint", label: "Mint", accent: "#0f766e", surface: "#e6fffb" },
  { id: "amber", label: "Amber", accent: "#b45309", surface: "#fff4db" },
  { id: "rose", label: "Rose", accent: "#be185d", surface: "#fff0f6" }
];

export function getThemeModeOption(themeMode: ThemeMode) {
  return themeModes.find((mode) => mode.id === themeMode) ?? themeModes[0];
}

export function resolveThemeMode(value: string | null | undefined): ThemeMode {
  return themeModes.find((mode) => mode.id === value)?.id ?? "core";
}

export function readStoredThemeMode(storage: Pick<Storage, "getItem"> | null | undefined): ThemeMode {
  try {
    return resolveThemeMode(storage?.getItem(THEME_MODE_STORAGE_KEY));
  } catch {
    return "core";
  }
}

export function persistThemeMode(storage: Pick<Storage, "setItem"> | null | undefined, themeMode: ThemeMode) {
  try {
    storage?.setItem(THEME_MODE_STORAGE_KEY, themeMode);
  } catch {
    return;
  }
}

export function applyThemeModeToDocument(
  themeMode: ThemeMode,
  documentLike: ThemeDocumentLike | null | undefined
) {
  if (!documentLike) {
    return;
  }

  documentLike.documentElement.dataset.themeMode = themeMode;
}
