"use client";

import {
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type Usage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};

type TokenTotals = {
  prompt: number;
  completion: number;
  total: number;
};

type ChatApiSuccess = {
  content: string;
  usage: Usage;
  model: string;
  responseTimeMs: number;
  tokensPerSecond: number;
};

type PersistedMetrics = {
  lastUsage: Usage | null;
  tokenTotals: TokenTotals;
  modelUsed: string;
  responseTimeMs: number;
  tokensPerSecond: number;
};

const STORAGE_MESSAGES_KEY = "groq-chat-messages";
const STORAGE_METRICS_KEY = "groq-chat-metrics";

const EMPTY_USAGE: Usage = {
  prompt_tokens: 0,
  completion_tokens: 0,
  total_tokens: 0,
};

const EMPTY_TOTALS: TokenTotals = {
  prompt: 0,
  completion: 0,
  total: 0,
};

function getInitialMessages(): ChatMessage[] {
  if (typeof window === "undefined") {
    return [];
  }

  const storedMessages = window.localStorage.getItem(STORAGE_MESSAGES_KEY);
  if (!storedMessages) {
    return [];
  }

  try {
    const parsed = JSON.parse(storedMessages) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(
      (item): item is ChatMessage =>
        typeof item === "object" &&
        item !== null &&
        "role" in item &&
        "content" in item &&
        (item.role === "user" || item.role === "assistant") &&
        typeof item.content === "string"
    );
  } catch {
    window.localStorage.removeItem(STORAGE_MESSAGES_KEY);
    return [];
  }
}

function getInitialMetrics(): PersistedMetrics {
  if (typeof window === "undefined") {
    return {
      lastUsage: null,
      tokenTotals: EMPTY_TOTALS,
      modelUsed: "-",
      responseTimeMs: 0,
      tokensPerSecond: 0,
    };
  }

  const storedMetrics = window.localStorage.getItem(STORAGE_METRICS_KEY);
  if (!storedMetrics) {
    return {
      lastUsage: null,
      tokenTotals: EMPTY_TOTALS,
      modelUsed: "-",
      responseTimeMs: 0,
      tokensPerSecond: 0,
    };
  }

  try {
    const parsed = JSON.parse(storedMetrics) as PersistedMetrics;
    return {
      lastUsage: parsed.lastUsage ?? null,
      tokenTotals: parsed.tokenTotals ?? EMPTY_TOTALS,
      modelUsed: typeof parsed.modelUsed === "string" ? parsed.modelUsed : "-",
      responseTimeMs:
        typeof parsed.responseTimeMs === "number" ? parsed.responseTimeMs : 0,
      tokensPerSecond:
        typeof parsed.tokensPerSecond === "number" ? parsed.tokensPerSecond : 0,
    };
  } catch {
    window.localStorage.removeItem(STORAGE_METRICS_KEY);
    return {
      lastUsage: null,
      tokenTotals: EMPTY_TOTALS,
      modelUsed: "-",
      responseTimeMs: 0,
      tokensPerSecond: 0,
    };
  }
}

export default function Home() {
  const [initialMetrics] = useState<PersistedMetrics>(getInitialMetrics);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(getInitialMessages);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUsage, setLastUsage] = useState<Usage | null>(initialMetrics.lastUsage);
  const [tokenTotals, setTokenTotals] = useState<TokenTotals>(
    initialMetrics.tokenTotals
  );
  const [modelUsed, setModelUsed] = useState(initialMetrics.modelUsed);
  const [responseTimeMs, setResponseTimeMs] = useState(initialMetrics.responseTimeMs);
  const [tokensPerSecond, setTokensPerSecond] = useState(
    initialMetrics.tokensPerSecond
  );
  const isHydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(STORAGE_MESSAGES_KEY, JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const payload: PersistedMetrics = {
      lastUsage,
      tokenTotals,
      modelUsed,
      responseTimeMs,
      tokensPerSecond,
    };

    window.localStorage.setItem(STORAGE_METRICS_KEY, JSON.stringify(payload));
  }, [lastUsage, tokenTotals, modelUsed, responseTimeMs, tokensPerSecond]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const sendDisabled = useMemo(
    () => !isHydrated || isLoading || input.trim().length === 0,
    [isHydrated, isLoading, input]
  );

  const clearConversation = () => {
    setMessages([]);
    setInput("");
    setError(null);
    setIsLoading(false);
    setLastUsage(null);
    setTokenTotals(EMPTY_TOTALS);
    setModelUsed("-");
    setResponseTimeMs(0);
    setTokensPerSecond(0);

    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_MESSAGES_KEY);
      window.localStorage.removeItem(STORAGE_METRICS_KEY);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = input.trim();

    if (!trimmed || isLoading) {
      return;
    }

    const userMessage: ChatMessage = { role: "user", content: trimmed };
    const nextMessages = [...messages, userMessage];

    setMessages(nextMessages);
    setInput("");
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messages: nextMessages }),
      });

      const data = (await response.json()) as ChatApiSuccess & { error?: string };

      if (!response.ok) {
        throw new Error(data.error || "No se pudo obtener respuesta de la IA.");
      }

      const assistantMessage: ChatMessage = {
        role: "assistant",
        content:
          data.content?.trim() ||
          "No se recibió contenido en la respuesta del modelo.",
      };

      setMessages((current) => [...current, assistantMessage]);

      const usage = data.usage ?? EMPTY_USAGE;
      setLastUsage(usage);
      setTokenTotals((current) => ({
        prompt: current.prompt + usage.prompt_tokens,
        completion: current.completion + usage.completion_tokens,
        total: current.total + usage.total_tokens,
      }));

      setModelUsed(data.model || "-");
      setResponseTimeMs(data.responseTimeMs || 0);
      setTokensPerSecond(data.tokensPerSecond || 0);
    } catch (unknownError) {
      const message =
        unknownError instanceof Error
          ? unknownError.message
          : "Ocurrió un error inesperado al contactar la API.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#030712] px-2 py-2 text-slate-100 sm:px-5 sm:py-6">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 top-0 h-64 w-64 rounded-full bg-cyan-500/25 blur-3xl" />
        <div className="absolute -right-24 bottom-0 h-72 w-72 rounded-full bg-emerald-500/20 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(45,212,191,0.1),transparent_45%),radial-gradient(circle_at_bottom,rgba(14,165,233,0.08),transparent_50%)]" />
      </div>

      <main className="relative flex h-[100dvh] max-h-[100dvh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-cyan-500/20 bg-slate-950/85 shadow-[0_0_40px_rgba(6,182,212,0.15)] backdrop-blur sm:h-[95vh] sm:max-h-[95vh]">
        <header className="shrink-0 border-b border-cyan-400/20 px-4 py-4 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-cyan-300/80">
                Regenerik AI Console
              </p>
              <h1 className="text-xl font-semibold text-cyan-100 sm:text-2xl">
                Chat con Groq + Llama 3
              </h1>
            </div>
            <button
              type="button"
              onClick={clearConversation}
              className="rounded-xl border border-rose-400/50 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/20 sm:text-sm"
            >
              Borrar conversacion
            </button>
          </div>
        </header>

        <section className="grid min-h-0 flex-1 gap-3 p-3 sm:p-4 lg:grid-cols-[minmax(0,2.2fr)_minmax(280px,1fr)]">
          <article className="order-2 flex min-h-0 flex-col rounded-2xl border border-slate-700/70 bg-slate-900/50 lg:order-1">
            <div className="border-b border-slate-700/70 px-4 py-3">
              <p className="text-sm font-medium text-cyan-100">Conversacion</p>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-4 sm:px-4">
              {!isHydrated ? (
                <div className="rounded-2xl border border-dashed border-cyan-500/30 bg-slate-900/80 p-6 text-center text-sm text-slate-300">
                  Cargando conversacion guardada...
                </div>
              ) : null}

              {isHydrated && messages.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-cyan-500/30 bg-slate-900/80 p-6 text-center text-sm text-slate-300">
                  Inicia la charla escribiendo tu primer mensaje. El contexto completo
                  se enviara en cada solicitud a Groq.
                </div>
              ) : null}

              {isHydrated
                ? messages.map((message, index) => {
                const isUser = message.role === "user";
                return (
                  <div
                    key={`${message.role}-${index}-${message.content.slice(0, 20)}`}
                    className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-lg sm:max-w-[75%] ${
                        isUser
                          ? "border border-cyan-400/40 bg-cyan-500/20 text-cyan-50"
                          : "border border-emerald-400/30 bg-emerald-500/15 text-emerald-50"
                      }`}
                    >
                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide opacity-80">
                        {isUser ? "Usuario" : "IA"}
                      </p>
                      <p className="whitespace-pre-wrap break-words">{message.content}</p>
                    </div>
                  </div>
                );
                  })
                : null}

              {isLoading ? (
                <div className="flex justify-start">
                  <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/15 px-4 py-3 text-sm text-emerald-50">
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide opacity-80">
                      IA
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-300" />
                      <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-300 [animation-delay:120ms]" />
                      <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-300 [animation-delay:240ms]" />
                      <span className="ml-1">Pensando...</span>
                    </div>
                  </div>
                </div>
              ) : null}

              <div ref={bottomRef} />
            </div>

            <form
              onSubmit={handleSubmit}
              className="border-t border-slate-700/70 p-3 sm:p-4"
            >
              <div className="flex gap-2 sm:gap-3">
                <input
                  type="text"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="Escribe tu mensaje aqui..."
                  className="w-full rounded-xl border border-slate-600 bg-slate-950/90 px-3 py-2 text-sm text-slate-100 outline-none ring-cyan-400 placeholder:text-slate-500 focus:ring-2"
                />
                <button
                  type="submit"
                  disabled={sendDisabled}
                  className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-cyan-700 disabled:text-slate-200"
                >
                  {isLoading ? "Enviando" : "Enviar"}
                </button>
              </div>
            </form>
          </article>

          <aside className="order-1 max-h-[28vh] overflow-y-auto rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4 lg:order-2 lg:max-h-none lg:overflow-visible">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-cyan-200">
              Metricas de la sesion
            </h2>

            {error ? (
              <div className="mb-3 rounded-xl border border-rose-400/40 bg-rose-500/10 p-3 text-xs text-rose-100">
                Error: {error}
              </div>
            ) : null}

            <div className="space-y-2 text-sm">
              <MetricRow
                label="Tokens prompt (ultima)"
                value={String(isHydrated ? (lastUsage?.prompt_tokens ?? 0) : 0)}
              />
              <MetricRow
                label="Tokens completion (ultima)"
                value={String(isHydrated ? (lastUsage?.completion_tokens ?? 0) : 0)}
              />
              <MetricRow
                label="Tokens totales (ultima)"
                value={String(isHydrated ? (lastUsage?.total_tokens ?? 0) : 0)}
              />
              <MetricRow
                label="Acumulado prompt"
                value={String(isHydrated ? tokenTotals.prompt : 0)}
              />
              <MetricRow
                label="Acumulado completion"
                value={String(isHydrated ? tokenTotals.completion : 0)}
              />
              <MetricRow
                label="Acumulado total"
                value={String(isHydrated ? tokenTotals.total : 0)}
              />
              <MetricRow label="Modelo usado" value={isHydrated ? modelUsed : "-"} />
              <MetricRow
                label="Tiempo respuesta"
                value={`${(isHydrated ? responseTimeMs : 0).toFixed(0)} ms`}
              />
              <MetricRow
                label="Tokens por segundo"
                value={(isHydrated ? tokensPerSecond : 0).toFixed(2)}
              />
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-700/70 bg-slate-900/70 px-3 py-2">
      <span className="text-slate-300">{label}</span>
      <span className="font-semibold text-cyan-100">{value}</span>
    </div>
  );
}
