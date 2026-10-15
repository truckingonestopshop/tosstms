"use client";

export type ToastKind = "success" | "error" | "info";
export interface ToastItem {
  id: number;
  kind: ToastKind;
  text: string;
  action?: { label: string; run: () => void };
}

type Listener = (items: ToastItem[]) => void;
let items: ToastItem[] = [];
let seq = 1;
const listeners = new Set<Listener>();

const emit = () => listeners.forEach((l) => l(items));

export function subscribeToasts(l: Listener) {
  listeners.add(l);
  l(items);
  return () => {
    listeners.delete(l);
  };
}

export function dismissToast(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

function push(kind: ToastKind, text: string, action?: ToastItem["action"]) {
  const id = seq++;
  items = [...items.slice(-3), { id, kind, text, action }];
  emit();
  setTimeout(() => dismissToast(id), kind === "error" ? 6000 : 3200);
  return id;
}

export const toast = {
  success: (text: string, action?: ToastItem["action"]) => push("success", text, action),
  error: (text: string) => push("error", text),
  info: (text: string) => push("info", text),
};
