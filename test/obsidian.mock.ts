// Minimal stand-in for the `obsidian` runtime module so pure logic in src/ can
// be unit-tested in Node. Only the symbols imported (as values) by the modules
// under test need to exist; the functions we actually test never call these.

export function parseYaml(): unknown {
  return {};
}
export function stringifyYaml(): string {
  return "";
}
export function getAllTags(): string[] {
  return [];
}
export function prepareFuzzySearch(): (t: string) => null {
  return () => null;
}
export function setIcon(): void {}
export function debounce<T extends (...a: never[]) => unknown>(fn: T): T {
  return fn;
}

export class TFile {}
export class Modal {}
export class Menu {}
export class Notice {}
export class Setting {}
export class PluginSettingTab {}
export class Plugin {}
export class ItemView {}
export class FuzzySuggestModal {}
export class EditorSuggest {}

export type App = unknown;
export type Editor = unknown;
export type EditorPosition = unknown;
export type EditorSuggestContext = unknown;
export type EditorSuggestTriggerInfo = unknown;
export type WorkspaceLeaf = unknown;
export type Debouncer<A extends unknown[], R> = (...args: A) => R;
