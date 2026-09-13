"use client";
import { Megaphone } from "lucide-react";
import { OPEN_NEWS_EVENT } from "./news-gate";

/** Topbar entry to reopen the News window on demand. */
export function NewsButton() {
  return (
    <button
      type="button"
      title="News"
      aria-label="News"
      onClick={() => window.dispatchEvent(new CustomEvent(OPEN_NEWS_EVENT))}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
    >
      <Megaphone className="h-5 w-5" />
    </button>
  );
}
