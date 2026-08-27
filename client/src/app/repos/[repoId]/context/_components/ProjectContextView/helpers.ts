import type { ContextDoc, ContextFolder } from "@devdigest/shared";
import { CONTEXT_SEARCH_ROOTS } from "./constants";

/** Case-insensitive filter over a document's path + name. Mirrors
    ConventionsView-family filter helpers. */
export function filterDocs(docs: ContextDoc[], search: string): ContextDoc[] {
  const q = search.trim().toLowerCase();
  if (!q) return docs;
  return docs.filter((d) => `${d.path} ${d.name}`.toLowerCase().includes(q));
}

/** Human-readable byte size — no locale-dependent formatting, just B/KB/MB. */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Every folder path a new node could be created under: the search roots plus
    every folder implied by an existing document or registered empty folder. */
export function folderChoices(docs: ContextDoc[], folders: ContextFolder[]): string[] {
  const set = new Set<string>(CONTEXT_SEARCH_ROOTS);
  for (const f of folders) if (f.path) set.add(f.path);
  for (const d of docs) {
    const segs = d.path.split("/").filter(Boolean);
    segs.pop();
    for (let i = 1; i <= segs.length; i++) set.add(segs.slice(0, i).join("/"));
  }
  return [...set].sort();
}

/** Encode an ArrayBuffer as base64 without blowing the call stack on ~1 MiB. */
export function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
