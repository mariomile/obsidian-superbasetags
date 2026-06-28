// Default emoji icons keyed by the supertag tag. Mirrors the icons used in the
// vault's existing Bases so the panel looks familiar from day one. Anything not
// listed falls back to the configurable default icon.

export const DEFAULT_ICONS: Record<string, string> = {
  "type/concept": "📍",
  "type/person": "👤",
  "type/content": "📄",
  "type/decision": "💡",
  "type/company": "🏢",
  "type/reference": "📚",
  "type/goal": "🎯",
  "type/project": "🚀",
  "type/book": "📖",
  "type/article": "📰",
  "type/course": "🎓",
  "type/context": "🧭",
  "type/memory": "🧠",
  "type/transcript": "🎙️",
  "type/template": "🧩",
  "type/index": "🗂️",
  "type/moc": "🗺️",
};

export function iconFor(tag: string, fallback: string): string {
  return DEFAULT_ICONS[tag] ?? fallback;
}
