"use client";

import {
  ArrowUp,
  BrainCircuit,
  CalendarClock,
  ChartLine,
  Code2,
  Info,
  PlugZap,
  RotateCcw,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { type FormEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";

import { DepowerBot } from "@/components/depower-bot";
import { liveCoverage } from "@/lib/dashboard";
import { getLang, t } from "@/lib/i18n";
import { fmt, pct } from "@/lib/labels";
import { extremeBlocks, rollingMae } from "@/lib/stats";
import { berlinDate, dateLabel, hourRangeLabel } from "@/lib/time";
import type { TomorrowFile, TrackRecordFile } from "@/lib/types";
import { cn } from "@/lib/utils";

/* "Ask depower": a small chat answered by the depower-ask Worker (deploy/ask-worker) with Claude
 * Haiku. The four suggested questions are answered here from the published data, without the API,
 * so they are free and don't count toward the daily limit. */

const API = "/api/ask";
// The local dev server has no Worker, so it calls the live one (which allows localhost).
const LIVE_API = "https://depower.abdulhabeeb.com/api/ask";

type LinkId = "tomorrow" | "track_record" | "model" | "ev_charging" | "about" | "source_code" | "author";
const LINKS: Record<LinkId, { label: () => string; href: string; icon: LucideIcon; external?: boolean }> = {
  tomorrow: { label: () => t("Tomorrow"), href: "/", icon: CalendarClock },
  track_record: { label: () => t("Track record"), href: "/track-record/", icon: ChartLine },
  model: { label: () => t("Model"), href: "/model/", icon: BrainCircuit },
  ev_charging: { label: () => t("EV charging"), href: "/ev-charging/", icon: PlugZap },
  about: { label: () => t("About"), href: "/about/", icon: Info },
  source_code: { label: () => t("Source code"), href: "https://github.com/Habeeb9731/german-day-ahead-forecast", icon: Code2, external: true },
  author: { label: () => t("Who built it"), href: "https://abdulhabeeb.com/", icon: UserRound, external: true },
};

interface Message {
  role: "user" | "bot";
  text: string;
  note?: boolean;
  links?: LinkId[];
}

type Turn = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = ["cheapest", "accuracy", "method", "negative"] as const;
type Suggestion = (typeof SUGGESTIONS)[number];

function suggestionLabel(s: Suggestion): string {
  if (s === "cheapest") return t("Cheapest hours?");
  if (s === "accuracy") return t("How accurate is it?");
  if (s === "method") return t("How does it work?");
  return t("Why negative prices?");
}

function suggestionQuestion(s: Suggestion): string {
  if (s === "cheapest") return t("When is electricity cheapest?");
  if (s === "accuracy") return t("How accurate is the forecast?");
  if (s === "method") return t("How does the forecast work?");
  return t("Why do prices sometimes go negative?");
}

async function load<T>(file: string): Promise<T | null> {
  try {
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    const res = await fetch(`${base}/data/${file}`, { cache: "no-store" });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/** Answers to the suggested questions, built from the same data and helpers as the dashboard cards. */
async function instantAnswer(s: Suggestion): Promise<Message | null> {
  if (s === "method") {
    return {
      role: "bot",
      text: t("Every morning before the 12:00 auction, a LightGBM model forecasts all 24 hourly prices for the next day, with a likely range for each hour. It only uses data published before the 11:30 cutoff, logs each forecast once, and scores it in public when the real prices arrive."),
      links: ["model", "about"],
    };
  }
  if (s === "negative") {
    return {
      role: "bot",
      text: t("When wind and solar output is high and demand is low, some generators would rather pay than switch off, so the auction can clear below zero. It happens most often around sunny weekend middays."),
      links: ["tomorrow", "model"],
    };
  }
  if (s === "cheapest") {
    const file = await load<TomorrowFile>("tomorrow.json");
    if (!file || file.is_sample || file.status !== "ok" || file.hours.length < 3) return null;
    const blocks = extremeBlocks(file.hours, 3);
    if (!blocks) return null;
    const today = berlinDate(new Date());
    const vars = {
      date: dateLabel(file.delivery_date),
      range: hourRangeLabel(blocks.cheapest.start.valid_from_utc, 3),
      avg: fmt(blocks.cheapest.average),
      ct: fmt(blocks.cheapest.average / 10, 1),
      peak: hourRangeLabel(blocks.priciest.start.valid_from_utc, 3),
    };
    const text =
      file.delivery_date === today
        ? t("Today ({date}), the cheapest 3 hours are {range} at an average of {avg} EUR/MWh, about {ct} ct/kWh wholesale. The priciest stretch is {peak}.", vars)
        : t("For {date}, the cheapest 3 hours are {range} at an average of {avg} EUR/MWh, about {ct} ct/kWh wholesale. The priciest stretch is {peak}.", vars);
    return { role: "bot", text, links: ["tomorrow", "ev_charging"] };
  }
  const file = await load<TrackRecordFile>("track_record.json");
  if (!file || file.is_sample) return null;
  const rolling = rollingMae(file.hours, 7).at(-1);
  const coverage = liveCoverage(file.hours, 14);
  if (!rolling || coverage === null) return null;
  return {
    role: "bot",
    text: t("Over the last 7 scored days, the forecast missed by {mae} EUR/MWh on average, against {base} for simply repeating the previous day. {cov} of actual prices fell inside its P10–P90 range, where the target is 80%.", {
      mae: fmt(rolling.model),
      base: fmt(rolling.baseline_prev_day),
      cov: pct(coverage),
    }),
    links: ["track_record", "model"],
  };
}

function ownerKey(): string | null {
  try {
    const url = new URL(window.location.href);
    const given = url.searchParams.get("ask_owner");
    if (given) {
      if (given === "off") localStorage.removeItem("ask-owner");
      else localStorage.setItem("ask-owner", given);
      url.searchParams.delete("ask_owner");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }
    return localStorage.getItem("ask-owner");
  } catch {
    return null;
  }
}

function LinkButtons({ ids, onNavigate }: { ids: LinkId[]; onNavigate: () => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {ids.map((id) => {
        const link = LINKS[id];
        const Icon = link.icon;
        const className =
          "inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/15 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-md transition-colors hover:bg-white hover:text-[#04154a]";
        const body = (
          <>
            <Icon className="size-3.5" aria-hidden />
            {link.label()}
            <span aria-hidden>{link.external ? "↗" : "→"}</span>
          </>
        );
        return link.external ? (
          <a key={id} href={link.href} target="_blank" rel="noopener" className={className}>
            {body}
          </a>
        ) : (
          <Link key={id} href={link.href} onClick={onNavigate} className={className}>
            {body}
          </Link>
        );
      })}
    </div>
  );
}

export function AskDepower() {
  const [shown, setShown] = useState(false);
  const [open, setOpen] = useState(false);
  const [greet, setGreet] = useState(false);
  const [waving, setWaving] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);
  const [input, setInput] = useState("");
  const history = useRef<Turn[]>([]);
  const owner = useRef<string | null>(null);
  const log = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);

  // Appear after 2 seconds; greet once per visit and fade the greeting after 10 seconds.
  useEffect(() => {
    owner.current = ownerKey();
    let greeted = false;
    try {
      greeted = sessionStorage.getItem("ask-greeted") === "1";
    } catch {}
    const a = setTimeout(() => setShown(true), 2000);
    const b = greeted ? undefined : setTimeout(() => setGreet(true), 2500);
    // Wave once it has landed, at the same moment as the greeting.
    const c = setTimeout(() => setWaving(true), 2700);
    const d = setTimeout(() => setWaving(false), 4300);
    return () => {
      [a, c, d].forEach(clearTimeout);
      if (b) clearTimeout(b);
    };
  }, []);

  const dismissGreeting = useCallback(() => {
    setGreet(false);
    try {
      sessionStorage.setItem("ask-greeted", "1");
    } catch {}
  }, []);

  useEffect(() => {
    if (!greet) return;
    const timer = setTimeout(dismissGreeting, 10_000);
    return () => clearTimeout(timer);
  }, [greet, dismissGreeting]);

  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [messages, busy]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const toggle = () => {
    dismissGreeting();
    setOpen((v) => {
      if (!v && window.matchMedia("(pointer: fine)").matches) setTimeout(() => field.current?.focus(), 50);
      return !v;
    });
  };

  const remember = (question: string, answer: string) => {
    history.current = [...history.current, { role: "user" as const, content: question }, { role: "assistant" as const, content: answer }].slice(-8);
  };

  const limit = (): Message => ({
    role: "bot",
    note: true,
    text: t("To prevent abuse, chats are limited. Come back later to ask more, or in the meantime have a look at the track record or the model."),
    links: ["track_record", "model"],
  });

  const ask = async (question: string) => {
    question = question.trim().slice(0, 300);
    if (!question || busy || locked) return;
    setBusy(true);
    setInput("");
    setMessages((m) => [...m, { role: "user", text: question }]);
    try {
      const local = /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
      const res = await fetch(local ? LIVE_API : API, {
        method: "POST",
        headers: { "content-type": "application/json", ...(owner.current ? { "x-ask-owner": owner.current } : {}) },
        body: JSON.stringify({ question, history: history.current }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 429) {
        setLocked(true);
        setMessages((m) => [...m, limit()]);
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      if (data.on_topic) {
        setMessages((m) => [...m, { role: "bot", text: data.answer, links: (data.links ?? []).filter((l: string) => l in LINKS) }]);
        remember(question, data.answer);
      } else {
        setMessages((m) => [...m, { role: "bot", note: true, text: t("I can only answer questions about depower and the German power market. Try “When is power cheapest tomorrow?”") }]);
      }
      if (data.remaining === 0) {
        setLocked(true);
        setMessages((m) => [...m, limit()]);
      }
    } catch {
      setMessages((m) => [...m, { role: "bot", note: true, text: t("Something went wrong on my side. Please try again in a moment.") }]);
    } finally {
      setBusy(false);
      if (window.matchMedia("(pointer: fine)").matches) setTimeout(() => field.current?.focus(), 30);
    }
  };

  const suggest = async (s: Suggestion) => {
    if (busy) return;
    const question = suggestionQuestion(s);
    setBusy(true);
    setMessages((m) => [...m, { role: "user", text: question }]);
    const [answer] = await Promise.all([instantAnswer(s), new Promise((r) => setTimeout(r, 450))]);
    setBusy(false);
    if (!answer) return ask(question);
    setMessages((m) => [...m, answer]);
    remember(question, answer.text);
  };

  const clear = () => {
    if (busy) return;
    history.current = [];
    setMessages(locked ? [limit()] : []);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void ask(input);
  };

  const hasChat = messages.length > 0;
  const lang = getLang();

  return (
    <div
      className={cn(
        "pointer-events-none fixed right-4 bottom-20 z-50 flex flex-col items-end gap-3 md:right-6 md:bottom-6",
        "transition-opacity duration-200",
        shown ? "opacity-100" : "opacity-0",
      )}
      lang={lang}
    >
      {open && (
        <div
          role="dialog"
          aria-label={t("Ask depower")}
          className="pointer-events-auto flex max-h-[min(640px,calc(100dvh-9.5rem))] w-[min(390px,calc(100vw-2rem))] origin-bottom-right animate-in fade-in zoom-in-95 slide-in-from-bottom-2 relative isolate flex-col overflow-hidden rounded-[1.75rem] border border-white/15 bg-[#04154a] text-white shadow-2xl duration-300 md:max-h-[min(640px,calc(100dvh-7rem))]"
        >
          {/* A wind turbine over a rapeseed field behind the whole panel, washed in navy so white text stays readable. */}
          <Image
            src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/images/ask-panel.jpg`}
            alt=""
            fill
            sizes="390px"
            className="-z-20 object-cover object-[50%_40%]"
          />
          <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[#04154a]/70 via-[#061c63]/45 to-[#04154a]/85" aria-hidden />
          <div className="shrink-0 px-5 pt-5 pb-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-heading text-xl font-medium tracking-tight">{t("Ask depower")}</p>
                <p className="mt-1 text-xs text-white/70">{t("From the live forecast and the project notes")}</p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                {hasChat && (
                  <button
                    type="button"
                    onClick={clear}
                    title={t("Clear chat")}
                    aria-label={t("Clear chat")}
                    className="grid size-8 place-items-center rounded-full border border-white/20 bg-white/10 backdrop-blur transition hover:-rotate-45 hover:bg-white/20"
                  >
                    <RotateCcw className="size-3.5" aria-hidden />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label={t("Close")}
                  className="grid size-8 place-items-center rounded-full border border-white/20 bg-white/10 backdrop-blur transition hover:rotate-90 hover:bg-white/20"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>
            </div>
          </div>

          <div ref={log} className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto overscroll-contain px-4 py-4" aria-live="polite">
            {!hasChat && (
              <div className="py-2">
                <p className="font-heading text-2xl font-medium tracking-tight">{t("What would you like to know?")}</p>
                <p className="mt-1 text-sm text-white/70">{t("Prices, accuracy, the method, or how the power market works.")}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => void suggest(s)}
                      className="rounded-full border border-white/20 bg-white/10 px-3.5 py-2 text-sm text-white backdrop-blur-md transition-colors hover:bg-white/20"
                    >
                      {suggestionLabel(s)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <Bubble key={i} message={m} onNavigate={() => setOpen(false)} />
            ))}
            {busy && (
              <div className="flex w-fit gap-1 rounded-2xl rounded-bl-md border border-white/15 bg-white/12 px-3.5 py-3 backdrop-blur-md" aria-label={t("Thinking")}>
                {[0, 1, 2].map((d) => (
                  <span key={d} className="size-1.5 animate-bounce rounded-full bg-white/70" style={{ animationDelay: `${d * 120}ms` }} />
                ))}
              </div>
            )}
          </div>

          <form onSubmit={submit} className="flex shrink-0 items-center gap-2 border-t border-white/15 p-3">
            <input
              ref={field}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={300}
              disabled={locked}
              aria-label={t("Ask a question")}
              placeholder={locked ? "" : t("Ask about prices or the forecast…")}
              className="h-11 min-w-0 flex-1 rounded-full border border-white/20 bg-white/10 px-4 text-sm text-white outline-none backdrop-blur-md transition placeholder:text-white/55 focus:border-white/50 focus:bg-white/15 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={busy || locked || !input.trim()}
              aria-label={t("Send question")}
              className="grid size-11 shrink-0 place-items-center rounded-full bg-white text-[#04154a] transition hover:bg-accent hover:text-white disabled:opacity-40"
            >
              <ArrowUp className="size-4.5" aria-hidden />
            </button>
          </form>
        </div>
      )}

      {greet && !open && (
        <div className="pointer-events-auto flex max-w-64 animate-in fade-in slide-in-from-bottom-1 items-start gap-1 rounded-2xl rounded-br-md border border-border bg-card py-3 pr-2 pl-4 text-sm text-card-foreground shadow-lg duration-300">
          <button type="button" onClick={toggle} className="text-left">
            {t("Hi! Ask me when power is cheapest, or how accurate the forecast is.")}
          </button>
          <button
            type="button"
            onClick={dismissGreeting}
            aria-label={t("Dismiss")}
            className="grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-secondary"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-label={t("Ask depower")}
        className={cn("db-launcher pointer-events-auto relative -mb-1 rounded-3xl outline-none focus-visible:ring-3 focus-visible:ring-ring/40", shown && "is-entering")}
      >
        <DepowerBot waving={waving} className="h-[86px] w-[73px] max-md:h-[70px] max-md:w-[59px]" />
        <span
          aria-hidden
          className="absolute inset-x-3 -bottom-0.5 -z-10 h-2.5 rounded-[50%] bg-[#2563eb]/25 blur-[3px]"
        />
      </button>
    </div>
  );
}

function Bubble({ message, onNavigate }: { message: Message; onNavigate: () => void }): ReactNode {
  if (message.role === "user") {
    return (
      <p className="max-w-[85%] self-end rounded-2xl rounded-br-md bg-white px-3.5 py-2 text-sm text-[#04154a]">
        {message.text}
      </p>
    );
  }
  return (
    <div className="flex max-w-[92%] flex-col gap-2 self-start">
      <p
        className={cn(
          "rounded-2xl rounded-bl-md border border-white/15 bg-white/12 px-3.5 py-2.5 text-sm leading-relaxed text-white backdrop-blur-md",
          message.note && "text-white/75",
        )}
      >
        {message.text}
      </p>
      {message.links && message.links.length > 0 && <LinkButtons ids={message.links} onNavigate={onNavigate} />}
    </div>
  );
}
