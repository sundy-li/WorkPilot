export interface AvatarPalette {
  id: string;
  background: string;
  foreground: string;
}

export type AvatarGlyphId = "sprout" | "comet" | "pebble" | "orbit" | "bloom";

export const avatarPalettes: AvatarPalette[] = [
  { id: "amber", background: "#fde68a", foreground: "#78350f" },
  { id: "sky", background: "#bae6fd", foreground: "#0c4a6e" },
  { id: "rose", background: "#fecdd3", foreground: "#881337" },
  { id: "emerald", background: "#bbf7d0", foreground: "#14532d" },
  { id: "violet", background: "#ddd6fe", foreground: "#4c1d95" }
];

export const avatarGlyphIds: AvatarGlyphId[] = ["sprout", "comet", "pebble", "orbit", "bloom"];

export function getAvatarInitials(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) {
    return "U";
  }

  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

export function getAvatarPalette(seed: string) {
  const hash = Array.from(seed).reduce((total, character) => total + character.charCodeAt(0), 0);
  return avatarPalettes[hash % avatarPalettes.length] ?? avatarPalettes[0];
}

export function getAvatarPaletteById(id: string) {
  return avatarPalettes.find((palette) => palette.id === id) ?? avatarPalettes[0];
}

export function getAvatarGlyph(seed: string) {
  const hash = Array.from(seed).reduce((total, character, index) => total + character.charCodeAt(0) * (index + 1), 0);
  return avatarGlyphIds[hash % avatarGlyphIds.length] ?? avatarGlyphIds[0];
}
