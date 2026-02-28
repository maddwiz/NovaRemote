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

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
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
    if (profile.apiKey.trim()) {
      headers.Authorization = `Bearer ${profile.apiKey}`;
    }

    if (profile.kind === "openai_compatible") {
      const baseUrl = normalizeUrl(profile.baseUrl || "https://api.openai.com/v1");
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: profile.model,
          messages: [
            ...(profile.systemPrompt ? [{ role: "system", content: profile.systemPrompt }] : []),
            { role: "user", content: prompt },
          ],
          temperature: 0.2,
        }),
      });

      if (response.status === 404 || response.status === 405) {
        const fallback = await fetch(`${baseUrl}/responses`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: profile.model,
            instructions: profile.systemPrompt || undefined,
            input: prompt,
          }),
        });

        if (!fallback.ok) {
          const detail = await fallback.text();
          throw new Error(`LLM request failed: ${fallback.status} ${detail || fallback.statusText}`);
        }

        const payload = (await fallback.json()) as OpenAiResponsesResponse;
        const text =
          payload.output_text ||
          toText(
            payload.output
              ?.flatMap((entry) => entry.content || [])
              .map((entry) => entry.text || "")
              .filter(Boolean)
          );
        if (!text) {
          throw new Error("LLM response was empty.");
        }
        return text;
      }

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`LLM request failed: ${response.status} ${detail || response.statusText}`);
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
