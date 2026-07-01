import { NextResponse } from "next/server";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type GroqChoice = {
  message?: {
    role?: string;
    content?: string;
  };
};

type GroqUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

type GroqResponse = {
  choices?: GroqChoice[];
  usage?: GroqUsage;
  model?: string;
  error?: {
    message?: string;
  };
};

type ChatRequestBody = {
  messages?: ChatMessage[];
};

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ChatRequestBody;
    const messages = Array.isArray(body.messages) ? body.messages : [];

    const safeMessages = messages.filter(
      (message): message is ChatMessage =>
        !!message &&
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string" &&
        message.content.trim().length > 0
    );

    if (safeMessages.length === 0) {
      return NextResponse.json(
        { error: "Debes enviar al menos un mensaje valido." },
        { status: 400 }
      );
    }

    const apiKey = process.env.GROQ_API_KEY;
    const model = process.env.GROQ_MODEL || "llama-3.1-8b-instant";

    if (!apiKey) {
      return NextResponse.json(
        { error: "Falta configurar GROQ_API_KEY en variables de entorno." },
        { status: 500 }
      );
    }

    const startedAt = Date.now();

    const groqResponse = await fetch(GROQ_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: safeMessages,
      }),
    });

    const groqData = (await groqResponse.json()) as GroqResponse;

    if (!groqResponse.ok) {
      const apiError =
        groqData?.error?.message || "No se pudo procesar la solicitud en Groq.";

      return NextResponse.json({ error: apiError }, { status: groqResponse.status });
    }

    const content = groqData.choices?.[0]?.message?.content?.trim() || "";

    if (!content) {
      return NextResponse.json(
        { error: "Groq no devolvio contenido para este mensaje." },
        { status: 502 }
      );
    }

    const usage = {
      prompt_tokens: Number(groqData.usage?.prompt_tokens ?? 0),
      completion_tokens: Number(groqData.usage?.completion_tokens ?? 0),
      total_tokens: Number(groqData.usage?.total_tokens ?? 0),
    };

    const responseTimeMs = Date.now() - startedAt;
    const completionSeconds = responseTimeMs > 0 ? responseTimeMs / 1000 : 0;
    const tokensPerSecond =
      completionSeconds > 0
        ? Number((usage.completion_tokens / completionSeconds).toFixed(2))
        : 0;

    return NextResponse.json(
      {
        content,
        usage,
        model: groqData.model || model,
        responseTimeMs,
        tokensPerSecond,
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      { error: "Error interno al procesar la solicitud." },
      { status: 500 }
    );
  }
}
