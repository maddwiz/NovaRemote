import { useCallback } from "react";

import { LlmProfile } from "../types";

type OpenAiChatResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
};

type OpenAiResponsesResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{ type?: string; text?: string }>;
  }>;
};

type AnthropicResponse = {
  content?: Array<{ type?: string; text?: string }>;
};

type OllamaGenerateResponse = {
  response?: string;
  message?: {
    content?: string;
  };
  error?: string;
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  error?: {
    message?: string;
  };
};

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

function resolveRequestUrl(baseUrl: string, path: string | undefined, fallbackPath: string): string {
  const raw = (path || fallbackPath).trim();
  if (!raw) {
    return `${baseUrl}${fallbackPath}`;
  }
  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }
  const normalizedPath = raw.startsWith("/") ? raw : `/${raw}`;
  return `${baseUrl}${normalizedPath}`;
}

function parseExtraHeaders(raw: string | undefined): Record<string, string> {
  if (!raw?.trim()) {
    return {};
  }
  const headers: Record<string, string> = {};
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }
    const splitIndex = trimmed.indexOf(":");
    if (splitIndex <= 0) {
      return;
    }
    const key = trimmed.slice(0, splitIndex).trim();
    const value = trimmed.slice(splitIndex + 1).trim();
    if (key && value) {
      headers[key] = value;
    }
  });
  return headers;
}

function toText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (item && typeof item === "object" && "text" in item && typeof item.text === "string") {
          return item.text;
        }
        return "";
      })
      .join("\n")
      .trim();
  }
  return "";
}

export function useLlmClient() {
  const sendPrompt = useCallback(async (profile: LlmProfile, prompt: string): Promise<string> => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (profile.apiKey.trim() && profile.kind !== "gemini") {
      headers.Authorization = `Bearer ${profile.apiKey}`;
    }
    Object.assign(headers, parseExtraHeaders(profile.extraHeaders));

    if (profile.kind === "openai_compatible") {
      const baseUrl = normalizeUrl(profile.baseUrl || "https://api.openai.com/v1");
      const isResponsesPath = Boolean(profile.requestPath?.trim() && /(^|\/)responses(\?|$)/i.test(profile.requestPath.trim()));
      const primaryPath = profile.requestPath?.trim() || (isResponsesPath ? "/responses" : "/chat/completions");
      const primaryUrl = resolveRequestUrl(baseUrl, primaryPath, "/chat/completions");

      const chatBody = {
        model: profile.model,
        messages: [
          ...(profile.systemPrompt ? [{ role: "system", content: profile.systemPrompt }] : []),
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
      };
      const responsesBody = {
        model: profile.model,
        instructions: profile.systemPrompt || undefined,
        input: prompt,
      };

      const response = await fetch(primaryUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(isResponsesPath ? responsesBody : chatBody),
      });

      if ((response.status === 404 || response.status === 405) && !isResponsesPath) {
        const fallback = await fetch(resolveRequestUrl(baseUrl, "/responses", "/responses"), {
          method: "POST",
          headers,
          body: JSON.stringify(responsesBody),
        });

        if (!fallback.ok) {
          const detail = await fallback.text();
          throw new Error(`LLM request failed: ${fallback.status} ${detail || fallback.statusText}`);
        }

        const payload = (await fallback.json()) as OpenAiResponsesResponse;
        const text = payload.output_text || toText(payload.output?.flatMap((entry) => entry.content || []));
        if (!text) {
          throw new Error("LLM response was empty.");
        }
        return text;
      }

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`LLM request failed: ${response.status} ${detail || response.statusText}`);
      }

      if (isResponsesPath) {
        const payload = (await response.json()) as OpenAiResponsesResponse;
        const text = payload.output_text || toText(payload.output?.flatMap((entry) => entry.content || []));
        if (!text) {
          throw new Error("LLM response was empty.");
        }
        return text;
      }

      const payload = (await response.json()) as OpenAiChatResponse;
      const text = toText(payload.choices?.[0]?.message?.content);
      if (!text) {
        throw new Error("LLM response was empty.");
      }
      return text;
    }

    if (profile.kind === "ollama") {
      const baseUrl = normalizeUrl(profile.baseUrl || "http://localhost:11434");
      const requestBody = {
        model: profile.model,
        prompt,
        system: profile.systemPrompt || undefined,
        stream: false,
      };

      const response = await fetch(`${baseUrl}/api/generate`, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
      });

      if (response.status === 404 || response.status === 405) {
        const fallback = await fetch(`${baseUrl}/api/chat`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: profile.model,
            stream: false,
            messages: [
              ...(profile.systemPrompt ? [{ role: "system", content: profile.systemPrompt }] : []),
              { role: "user", content: prompt },
            ],
          }),
        });

        if (!fallback.ok) {
          const detail = await fallback.text();
          throw new Error(`LLM request failed: ${fallback.status} ${detail || fallback.statusText}`);
        }

        const payload = (await fallback.json()) as OllamaGenerateResponse;
        const text = payload.response || payload.message?.content || "";
        if (!text.trim()) {
          throw new Error("LLM response was empty.");
        }
        return text.trim();
      }

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`LLM request failed: ${response.status} ${detail || response.statusText}`);
      }

      const payload = (await response.json()) as OllamaGenerateResponse;
      const text = payload.response || payload.message?.content || "";
      if (!text.trim()) {
        throw new Error("LLM response was empty.");
      }
      return text.trim();
    }

    if (profile.kind === "gemini") {
      if (!profile.apiKey.trim()) {
        throw new Error("Gemini API key is required.");
      }
      const baseUrl = normalizeUrl(profile.baseUrl || "https://generativelanguage.googleapis.com/v1beta");
      const model = profile.model.trim().replace(/^models\//, "");
      const response = await fetch(`${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(profile.apiKey)}`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          ...(profile.systemPrompt
            ? {
                systemInstruction: {
                  role: "system",
                  parts: [{ text: profile.systemPrompt }],
                },
              }
            : {}),
          generationConfig: {
            temperature: 0.2,
          },
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],
        }),
      });

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`LLM request failed: ${response.status} ${detail || response.statusText}`);
      }

      const payload = (await response.json()) as GeminiResponse;
      const text = toText(payload.candidates?.[0]?.content?.parts || []);
      if (!text.trim()) {
        const errorDetail = payload.error?.message;
        throw new Error(errorDetail ? `LLM response was empty: ${errorDetail}` : "LLM response was empty.");
      }
      return text.trim();
    }

    if (!profile.apiKey.trim()) {
      throw new Error("Anthropic API key is required.");
    }

    const baseUrl = normalizeUrl(profile.baseUrl || "https://api.anthropic.com");
    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": profile.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: profile.model,
        max_tokens: 1024,
        system: profile.systemPrompt || undefined,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`LLM request failed: ${response.status} ${detail || response.statusText}`);
    }

    const payload = (await response.json()) as AnthropicResponse;
    const text = toText(payload.content);
    if (!text) {
      throw new Error("LLM response was empty.");
    }
    return text;
  }, []);

  return {
    sendPrompt,
  };
}
