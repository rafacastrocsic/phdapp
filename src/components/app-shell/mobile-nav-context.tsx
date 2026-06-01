"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePathname } from "next/navigation";

/**
 * Drives the mobile slide-in nav drawer.
 *
 * The drawer state is shared by:
 *   - Topbar (the hamburger button toggles it; only visible md:hidden)
 *   - Sidebar (on mobile it renders as a fixed-position overlay; on
 *     desktop the same component keeps its existing inline layout)
 *
 * We close the drawer automatically on route changes so it doesn't
 * stay open after the user picks a destination. Desktop is unaffected
 * — the open state simply isn't read above the md breakpoint.
 */
interface MobileNavCtx {
  open: boolean;
  setOpen: (v: boolean) => void;
  toggle: () => void;
  close: () => void;
}

const Ctx = createContext<MobileNavCtx | null>(null);

export function MobileNavProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Auto-close on navigation so a tap on a link doesn't leave the
  // drawer sitting over the new page.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Esc closes the drawer — standard a11y for any overlay UI.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Lock body scroll while the drawer is open so the page underneath
  // doesn't scroll when the user pans inside the drawer.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = open ? "hidden" : prev;
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const toggle = useCallback(() => setOpen((o) => !o), []);
  const close = useCallback(() => setOpen(false), []);

  const value = useMemo<MobileNavCtx>(
    () => ({ open, setOpen, toggle, close }),
    [open, toggle, close],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMobileNav(): MobileNavCtx {
  const v = useContext(Ctx);
  // Tolerant default for any tree that forgets to wrap — components
  // that read it (Sidebar, Topbar) gracefully no-op on mobile in
  // that case rather than crashing.
  if (!v) {
    return {
      open: false,
      setOpen: () => {},
      toggle: () => {},
      close: () => {},
    };
  }
  return v;
}
