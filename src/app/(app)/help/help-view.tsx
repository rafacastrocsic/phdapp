"use client";
import { useEffect, useState } from "react";
import { marked } from "marked";
import {
  HelpCircle,
  Presentation,
  ExternalLink,
  Loader2,
  ListTree,
  ArrowUp,
} from "lucide-react";

// "Supervisor guide" -> "Supervisor slides" for the deck download label.
const deckLabel = (m: Manual) => m.label.replace(/\s*guide$/i, " slides");
import { cn } from "@/lib/utils";

export type Manual = {
  key: string;
  label: string;
  /** filename under /help/ (public) */
  file: string;
  desc: string;
  /** optional slide-overview filename under /help/ (public) */
  deck?: string;
};

type TocItem = { id: string; text: string; level: number };

marked.setOptions({ gfm: true, breaks: false });

// Render a manual's markdown to HTML, give every h2/h3 a stable id (so the
// table of contents can anchor to it) and collect that TOC. The content is
// our own trusted manuals, so injecting the rendered HTML is safe here.
function renderDoc(md: string): { html: string; toc: TocItem[] } {
  const raw = marked.parse(md) as string;
  const toc: TocItem[] = [];
  const used = new Set<string>();
  const html = raw.replace(
    /<h([23])>([\s\S]*?)<\/h\1>/g,
    (_m, lvl: string, inner: string) => {
      // Strip tags, then decode the entities marked emits (& -> &amp; etc.)
      // so the display text and slug see the real characters.
      const text = inner
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#(?:39|x27);/gi, "'")
        .trim();
      // GitHub-style slug so the ids match the anchor links the manuals
      // author by hand (e.g. "Thesis & publications" -> "thesis--publications"):
      // drop punctuation, keep word chars / spaces / hyphens, spaces -> hyphens.
      const base =
        text
          .toLowerCase()
          .replace(/[^\w\s-]/g, "")
          .trim()
          .replace(/\s/g, "-") || "section";
      let id = base;
      let n = 2;
      while (used.has(id)) id = `${base}-${n++}`;
      used.add(id);
      toc.push({ id, text, level: Number(lvl) });
      return `<h${lvl} id="${id}">${inner}</h${lvl}>`;
    },
  );
  return { html, toc };
}

export function HelpView({ manuals }: { manuals: Manual[] }) {
  const [active, setActive] = useState(manuals[0].key);
  const manual = manuals.find((m) => m.key === active) ?? manuals[0];
  // Slide decks this profile may access — derived from the role-filtered
  // manual list, so each profile only sees the decks it's entitled to
  // (student -> student slides; supervisor/admin -> supervisor + student).
  const decks = manuals.filter((m) => m.deck);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [html, setHtml] = useState("");
  const [toc, setToc] = useState<TocItem[]>([]);
  const [showTop, setShowTop] = useState(false);

  // The scrollable region is the (app) layout's <main>, not the window — so
  // the "back to the top / contents" control watches and scrolls that.
  useEffect(() => {
    const main = document.querySelector("main");
    if (!main) return;
    const onScroll = () => setShowTop(main.scrollTop > 500);
    main.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => main.removeEventListener("scroll", onScroll);
  }, []);

  function scrollToTop() {
    document.querySelector("main")?.scrollTo({ top: 0, behavior: "smooth" });
  }

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setHtml("");
    setToc([]);
    fetch(`/help/${manual.file}`, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.text();
      })
      .then((md) => {
        if (cancelled) return;
        const out = renderDoc(md);
        setHtml(out.html);
        setToc(out.toc);
        setStatus("ready");
        // Jump back to the top of the scrollable main area on switch.
        document.querySelector("main")?.scrollTo({ top: 0 });
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [manual.file]);

  function jump(id: string) {
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="mx-auto w-full max-w-6xl p-4 md:p-6">
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 text-[var(--c-violet)]">
              <HelpCircle className="h-4 w-4" />
            </span>
            Help &amp; guides
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            The full PhDapp manual for your role, right inside the app. Use the
            contents list to jump around, or download the slides for a quick
            visual tour.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {decks.map((d) => (
            <a
              key={d.key}
              href={`/help/${d.deck}`}
              download
              title={`Download the ${deckLabel(d)} (PowerPoint)`}
              className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <Presentation className="h-4 w-4 text-[var(--c-violet)]" />
              {deckLabel(d)}
            </a>
          ))}
          <a
            href={`/help/${manual.file}`}
            target="_blank"
            rel="noopener noreferrer"
            title="Open this guide as raw Markdown"
            className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <ExternalLink className="h-4 w-4 text-slate-400" />
            Open raw
          </a>
        </div>
      </div>

      {/* Manual switcher (admins / supervisors see more than one) */}
      {manuals.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {manuals.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setActive(m.key)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-sm font-medium transition",
                m.key === active
                  ? "border-transparent bg-[var(--c-violet)] text-white shadow-sm"
                  : "bg-white text-slate-600 hover:bg-slate-50",
              )}
              title={m.desc}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}

      {status === "loading" && (
        <div className="flex items-center gap-2 py-16 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading {manual.label.toLowerCase()}…
        </div>
      )}

      {status === "error" && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Couldn&apos;t load this guide.{" "}
          <a
            href={`/help/${manual.file}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium underline"
          >
            Open the file directly
          </a>
          .
        </div>
      )}

      {status === "ready" && (
        <div className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-8">
          {/* Table of contents */}
          <aside className="mb-4 lg:mb-0">
            {/* Mobile: collapsible */}
            <details className="rounded-xl border bg-white lg:hidden">
              <summary className="flex cursor-pointer items-center gap-2 p-3 text-sm font-semibold text-slate-700">
                <ListTree className="h-4 w-4 text-slate-400" />
                On this page
              </summary>
              <TocList
                toc={toc}
                onJump={jump}
                className="border-l border-slate-200 px-3 pb-3"
              />
            </details>
            {/* Desktop: sticky */}
            <div className="hidden lg:block lg:sticky lg:top-4">
              <div className="mb-2 flex items-center gap-2 px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                <ListTree className="h-3.5 w-3.5" />
                On this page
              </div>
              <TocList
                toc={toc}
                onJump={jump}
                className="max-h-[calc(100vh-8rem)] overflow-y-auto overflow-x-hidden border-l border-slate-200 pr-1"
              />
            </div>
          </aside>

          {/* Rendered manual */}
          <article
            className="help-doc min-w-0 rounded-2xl border bg-white p-5 md:p-8"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      )}

      {/* Back to the top / table of contents */}
      {showTop && (
        <button
          type="button"
          onClick={scrollToTop}
          title="Back to the top (table of contents)"
          className="fixed bottom-6 right-6 z-30 inline-flex items-center gap-1.5 rounded-full border bg-white/95 px-4 py-2.5 text-sm font-medium text-slate-700 shadow-lg backdrop-blur transition hover:bg-white print:hidden"
        >
          <ArrowUp className="h-4 w-4 text-[var(--c-violet)]" />
          <span className="hidden sm:inline">Contents</span>
        </button>
      )}
    </div>
  );
}

function TocList({
  toc,
  onJump,
  className,
}: {
  toc: TocItem[];
  onJump: (id: string) => void;
  className?: string;
}) {
  return (
    <nav className={cn("flex flex-col text-[13px]", className)}>
      {toc.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onJump(item.id)}
          className={cn(
            // Wrap long titles cleanly inside the column (never clip or spill
            // into the article), with a subtle left rail that lights up on hover.
            "-ml-px block w-full whitespace-normal break-words rounded-md border-l-2 border-transparent px-2 py-1.5 text-left leading-snug text-slate-600 hover:border-violet-300 hover:bg-slate-100 hover:text-slate-900",
            item.level === 3 && "pl-4 text-[12px] text-slate-500",
          )}
          title={item.text}
        >
          {item.text}
        </button>
      ))}
    </nav>
  );
}
