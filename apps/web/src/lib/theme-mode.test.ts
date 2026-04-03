import { describe, expect, test } from "bun:test";
import {
  THEME_MODE_STORAGE_KEY,
  applyThemeModeToDocument,
  getThemeModeOption,
  readStoredThemeMode,
  resolveThemeMode,
  themeModes
} from "./theme-mode";

describe("theme mode", () => {
  test("falls back to core for unknown values", () => {
    expect(resolveThemeMode("unknown")).toBe("core");
    expect(resolveThemeMode(null)).toBe("core");
  });

  test("reads a stored supported theme mode", () => {
    const storage = {
      getItem(key: string) {
        return key === THEME_MODE_STORAGE_KEY ? "mint" : null;
      }
    };

    expect(readStoredThemeMode(storage)).toBe("mint");
  });

  test("exposes multiple selectable theme modes", () => {
    expect(themeModes.map((mode) => mode.id)).toEqual(["core", "mint", "amber", "rose"]);
  });

  test("returns the active option metadata", () => {
    expect(getThemeModeOption("amber")).toEqual(themeModes[2]);
  });

  test("applies the theme mode to the document element", () => {
    const documentLike = {
      documentElement: {
        dataset: {} as { themeMode?: string }
      }
    };

    applyThemeModeToDocument("rose", documentLike);

    expect(documentLike.documentElement.dataset.themeMode).toBe("rose");
  });
});
