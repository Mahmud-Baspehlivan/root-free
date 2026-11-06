// Shared state and small helpers used across the app.

import { t } from "./i18n.ts";
import type { Gender, Person, RelType, Tree, View } from "./types.ts";

/** The family tree, mirrored from the server (see sync.ts). */
export const state: Tree = { people: {}, relationships: [] };

/** Replace the whole tree in place, so every module keeps the same object. */
export function replaceTree(tree: Tree): void {
  state.people = tree.people;
  state.relationships = tree.relationships;
}

/** UI state shared between modules. */
export const ui = {
  /** Person being edited in the person dialog; null when adding. */
  editingId: null as string | null,
  /** Photo chosen in the person dialog. */
  currentPhoto: null as string | null,
  /** Person a new connection starts from, and the choices in that dialog. */
  relSourceId: null as string | null,
  selectedRelType: "parent" as RelType,
  selectedPickId: null as string | null,
  zoom: 1,
  view: "canvas" as View,
};

/** An element that must exist in index.html. */
export function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`#${id} is missing from the page`);
  return e as T;
}

/** Escape text for use in HTML, including attribute values. */
export function esc(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** A photo is only ever shown if it is an image data: URL. */
export function photoSrc(p: Pick<Person, "photo">): string | null {
  return p.photo && /^data:image\/[a-z+.-]+;base64,[A-Za-z0-9+/=\s]+$/i.test(p.photo)
    ? p.photo
    : null;
}

/** A new person id that will not collide with ids made in other browsers. */
export function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return "p" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function gClass(g: Gender | string): "male" | "female" | "other" {
  return g === "male" ? "male" : g === "female" ? "female" : "other";
}

export function lifespan(p: Person): string {
  if (p.birth && p.death) return p.birth + "–" + p.death;
  if (p.birth) return t("bornShort", { y: p.birth });
  if (p.death) return t("diedShort", { y: p.death });
  return "";
}

export function fullName(p: Person): string {
  return ((p.first || "") + (p.last ? " " + p.last : "")).trim() || t("unknownName");
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function showToast(msg: string, dur = 2600): void {
  const box = el("toast");
  box.textContent = msg;
  box.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.classList.remove("show"), dur);
}

/** Person icon for cards without a photo. */
export function personSVG(gc: string): string {
  const col = gc === "female" ? "#6b4fa0" : gc === "male" ? "#2d6a4f" : "#7a7060";
  return `<svg viewBox="0 0 24 24" fill="none" stroke="${col}" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>`;
}

export function openModal(id: string): void {
  el(id).style.display = "flex";
}
export function closeModal(id: string): void {
  el(id).style.display = "none";
}
