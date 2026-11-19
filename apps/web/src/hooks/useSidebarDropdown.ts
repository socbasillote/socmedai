import { useEffect, useLayoutEffect, useRef, type KeyboardEvent } from "react";

// Keep native Tab order while adding arrow navigation and focus restoration.
export function useSidebarDropdown(open: boolean, setOpen: (open: boolean) => void) {
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const restoring = useRef(false);
  const openingDirection = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!open || !openingDirection.current) return;
    const items = Array.from(root.current?.querySelectorAll<HTMLElement>("[data-dropdown-item]:not(:disabled)") ?? []);
    (openingDirection.current === "ArrowDown" ? items[0] : items.at(-1))?.focus();
    openingDirection.current = null;
  }, [open]);
  function close(restore = false) {
    setOpen(false);
    if (restore) {
      restoring.current = true;
      trigger.current?.focus();
      restoring.current = false;
    }
  }
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
    event.preventDefault();
    if (!open) {
      openingDirection.current = event.key;
      setOpen(true);
      return;
    }
    setOpen(true);
    const items = Array.from(root.current?.querySelectorAll<HTMLElement>("[data-dropdown-item]:not(:disabled)") ?? []);
    const index = items.indexOf(document.activeElement as HTMLElement);
    const next = index < 0 ? (event.key === "ArrowDown" ? 0 : items.length - 1)
      : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  }
  useEffect(() => {
    if (!open) return;
    const outside = (event: Event) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
    };
  }, [open, setOpen]);
  return { root, trigger, close, onKeyDown, onTriggerFocus: () => { if (!restoring.current) setOpen(true); } };
}
