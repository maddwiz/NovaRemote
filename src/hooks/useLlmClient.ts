import { useCallback } from "react";

import { LlmProfile, LlmSendOptions, LlmSendResult, LlmToolExecution } from "../types";

type OpenAiChatMessage = {
  content?: string | Array<{ type?: string; text?: string }>;
  tool_calls?: Array<{
    id?: string;
    type?: string;
    function?: {
      name?: string;
      arguments?: string;
    };
  }>;
};

type OpenAiChatResponse = {
  choices?: Array<{
    message?: OpenAiChatMessage;
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

type BuiltInTool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  run: (args: Record<string, unknown>, context: Record<string, string>) => string;
};

type ParsedToolCall = {
  id: string;
  name: string;
  rawArguments: string;
  arguments: Record<string, unknown>;
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

function appendQueryParam(url: string, key: string, value: string): string {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
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

function asStringRecord(input: Record<string, string> | undefined): Record<string, string> {
  if (!input) {
    return {};
  }
  const next: Record<string, string> = {};
  Object.entries(input).forEach(([key, value]) => {
    const cleanKey = key.trim();
    const cleanValue = String(value ?? "").trim();
    if (cleanKey && cleanValue) {
      next[cleanKey] = cleanValue;
    }
  });
  return next;
}

function parseJsonObject(raw: string): Record<string, unknown> {
  if (!raw.trim()) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

function asNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function asWord(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return fallback;
}

function mapCommandToBackend(command: string, target: string): string {
  const clean = command.trim();
  if (!clean) {
    return "";
  }
  const lowerTarget = target.trim().toLowerCase();
  const replacements: Array<[RegExp, string, string]> = [
    [/^ls\b/i, "Get-ChildItem", "dir"],
    [/^pwd\b/i, "Get-Location", "cd"],
    [/^cat\b/i, "Get-Content", "type"],
    [/^grep\b/i, "Select-String", "findstr"],
    [/^rm\b/i, "Remove-Item", "del"],
    [/^cp\b/i, "Copy-Item", "copy"],
    [/^mv\b/i, "Move-Item", "move"],
  ];
  let next = clean;
  replacements.forEach(([pattern, powershellVariant, cmdVariant]) => {
    if (lowerTarget === "powershell" || lowerTarget === "pwsh") {
      next = next.replace(pattern, powershellVariant);
      return;
    }
    if (lowerTarget === "cmd" || lowerTarget === "windows") {
      next = next.replace(pattern, cmdVariant);
    }
  });
  return next;
}

function builtInTools(): BuiltInTool[] {
  return [
    {
      name: "get_time",
      description: "Get the current local time for a timezone.",
      parameters: {
        type: "object",
        properties: {
          timezone: { type: "string", description: "IANA timezone like UTC or America/New_York" },
        },
        additionalProperties: false,
      },
      run: (args) => {
        const timezone = asWord(args.timezone, "UTC");
        const formatted = new Intl.DateTimeFormat("en-US", {
          timeZone: timezone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }).format(new Date());
        return JSON.stringify({ timezone, now: formatted });
      },
    },
    {
      name: "explain_exit_code",
      description: "Explain the meaning of a process exit code.",
      parameters: {
        type: "object",
        properties: {
          code: { type: "number" },
        },
        required: ["code"],
        additionalProperties: false,
      },
      run: (args) => {
        const code = Math.round(asNumber(args.code, 0));
        let meaning = "Process exited with an application-defined status.";
        if (code === 0) {
          meaning = "Success.";
        } else if (code === 1) {
          meaning = "General error.";
        } else if (code === 2) {
          meaning = "Misuse of shell builtins or incorrect command usage.";
        } else if (code === 126) {
          meaning = "Command found but not executable.";
        } else if (code === 127) {
          meaning = "Command not found.";
        } else if (code >= 128) {
          meaning = `Likely terminated by signal ${code - 128}.`;
        }
        return JSON.stringify({ code, meaning });
      },
    },
    {
      name: "format_command_for_backend",
      description: "Adapt a shell command for a target backend (bash, powershell, cmd).",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string" },
          target: { type: "string", enum: ["bash", "zsh", "powershell", "pwsh", "cmd", "windows"] },
        },
        required: ["command", "target"],
        additionalProperties: false,
      },
      run: (args) => {
        const command = asWord(args.command, "");
        const target = asWord(args.target, "bash");
        return JSON.stringify({
          target,
          input: command,
          output: mapCommandToBackend(command, target),
        });
      },
    },
    {
      name: "get_tool_context",
      description: "Return contextual values passed from NovaRemote (active server/session metadata).",
      parameters: {
        type: "object",
        properties: {
          key: { type: "string" },
        },
        additionalProperties: false,
      },
      run: (args, context) => {
        const key = asWord(args.key, "");
        if (key) {
          return JSON.stringify({ key, value: context[key] || null });
        }
        return JSON.stringify(context);
      },
    },
  ];
}

function buildOpenAiToolSpecs(tools: BuiltInTool[]) {
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

function extractOpenAiToolCalls(message: OpenAiChatMessage | undefined): ParsedToolCall[] {
  const raw = message?.tool_calls;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((entry, index) => {
      const name = entry?.function?.name?.trim() || "";
      const rawArguments = entry?.function?.arguments || "{}";
      if (!name) {
        return null;
      }
      return {
        id: entry.id || `tool-call-${index + 1}`,
        name,
        rawArguments,
        arguments: parseJsonObject(rawArguments),
      };
    })
    .filter((entry): entry is ParsedToolCall => Boolean(entry));
}

async function executeToolCalls(
  calls: ParsedToolCall[],
  tools: BuiltInTool[],
  context: Record<string, string>
): Promise<{ trace: LlmToolExecution[]; toolMessages: Array<{ role: "tool"; tool_call_id: string; content: string }> }> {
  const trace: LlmToolExecution[] = [];
  const toolMessages: Array<{ role: "tool"; tool_call_id: string; content: string }> = [];

  for (const call of calls) {
    const tool = tools.find((entry) => entry.name === call.name);
    if (!tool) {
      const output = JSON.stringify({ error: `Tool ${call.name} is not available.` });
      trace.push({
        name: call.name,
        arguments: call.rawArguments,
        output,
        error: "Tool not available",
      });
      toolMessages.push({ role: "tool", tool_call_id: call.id, content: output });
      continue;
    }

    try {
      const output = tool.run(call.arguments, context).slice(0, 6000);
      trace.push({
        name: call.name,
        arguments: JSON.stringify(call.arguments),
        output,
      });
      toolMessages.push({ role: "tool", tool_call_id: call.id, content: output });
    } catch (error) {
      const output = JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      });
      trace.push({
        name: call.name,
        arguments: JSON.stringify(call.arguments),
        output,
        error: error instanceof Error ? error.message : String(error),
      });
      toolMessages.push({ role: "tool", tool_call_id: call.id, content: output });
    }
  }

  return { trace, toolMessages };
}

function normalizeOptions(options?: LlmSendOptions) {
  return {
    imageUrl: options?.imageUrl?.trim() || "",
    enableBuiltInTools: Boolean(options?.enableBuiltInTools),
    toolContext: asStringRecord(options?.toolContext),
    maxToolRounds: Math.max(1, Math.min(Math.round(options?.maxToolRounds || 3), 5)),
  };
}

export const llmClientTestUtils = {
  parseExtraHeaders,
  mapCommandToBackend,
  normalizeOptions,
};

export function useLlmClient() {
  const sendPromptDetailed = useCallback(
    async (profile: LlmProfile, prompt: string, options?: LlmSendOptions): Promise<LlmSendResult> => {
      const cleanPrompt = prompt.trim();
      if (!cleanPrompt) {
        throw new Error("Prompt is required.");
      }

      const normalizedOptions = normalizeOptions(options);
      const useVision = Boolean(normalizedOptions.imageUrl);
      const wantedTools = normalizedOptions.enableBuiltInTools;
      const tools = wantedTools ? builtInTools() : [];

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (profile.apiKey.trim() && profile.kind !== "gemini" && profile.kind !== "azure_openai") {
        headers.Authorization = `Bearer ${profile.apiKey}`;
      }
      Object.assign(headers, parseExtraHeaders(profile.extraHeaders));

      const runOpenAiChat = async (
        url: string,
        chatHeaders: Record<string, string>,
        toolset: BuiltInTool[]
      ): Promise<LlmSendResult> => {
        const messages: Array<Record<string, unknown>> = [
          ...(profile.systemPrompt ? [{ role: "system", content: profile.systemPrompt }] : []),
          {
            role: "user",
            content: useVision
              ? [
                  { type: "text", text: cleanPrompt },
                  { type: "image_url", image_url: { url: normalizedOptions.imageUrl } },
                ]
              : cleanPrompt,
          },
        ];

        const trace: LlmToolExecution[] = [];

        for (let round = 0; round < normalizedOptions.maxToolRounds; round += 1) {
          const response = await fetch(url, {
            method: "POST",
            headers: chatHeaders,
            body: JSON.stringify({
              model: profile.model,
              messages,
              temperature: 0.2,
              ...(toolset.length > 0
                ? {
                    tools: buildOpenAiToolSpecs(toolset),
                    tool_choice: "auto",
                  }
                : {}),
            }),
          });

          if (!response.ok) {
            const detail = await response.text();
            throw new Error(`LLM request failed: ${response.status} ${detail || response.statusText}`);
          }

          const payload = (await response.json()) as OpenAiChatResponse;
          const message = payload.choices?.[0]?.message;
          const text = toText(message?.content || "").trim();
          const calls = toolset.length > 0 ? extractOpenAiToolCalls(message) : [];

          if (calls.length === 0) {
            if (!text) {
              throw new Error("LLM response was empty.");
            }
            return {
              text,
              toolCalls: trace,
              usedVision: useVision,
              usedTools: toolset.length > 0,
            };
          }

          messages.push({
            role: "assistant",
            content: message?.content || "",
            tool_calls: message?.tool_calls || [],
          });

          const executed = await executeToolCalls(calls, toolset, normalizedOptions.toolContext);
          trace.push(...executed.trace);
          executed.toolMessages.forEach((entry) => messages.push(entry));
        }

        throw new Error("Tool-calling loop reached max rounds without a final response.");
      };

      if (profile.kind === "openai_compatible") {
        const baseUrl = normalizeUrl(profile.baseUrl || "https://api.openai.com/v1");
        const requestPath = profile.requestPath?.trim() || "";
        const requestedResponsesPath = Boolean(requestPath && /(^|\/)responses(\?|$)/i.test(requestPath));
        const forceChat = useVision || tools.length > 0;
        const shouldUseResponses = requestedResponsesPath && !forceChat;
        const primaryPath = requestPath || (shouldUseResponses ? "/responses" : "/chat/completions");
        const primaryUrl = resolveRequestUrl(baseUrl, forceChat ? "/chat/completions" : primaryPath, "/chat/completions");

        if (forceChat) {
          try {
            return await runOpenAiChat(primaryUrl, headers, tools);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (tools.length > 0 && /400|422/.test(message)) {
              const fallback = await runOpenAiChat(primaryUrl, headers, []);
              return {
                ...fallback,
                text: `${fallback.text}\n\n[Tooling note] Provider rejected tool-calling payload; response returned without tools.`,
                usedTools: false,
              };
            }
            throw error;
          }
        }

        const chatBody = {
          model: profile.model,
          messages: [
            ...(profile.systemPrompt ? [{ role: "system", content: profile.systemPrompt }] : []),
            { role: "user", content: cleanPrompt },
          ],
          temperature: 0.2,
        };
        const responsesBody = {
          model: profile.model,
          instructions: profile.systemPrompt || undefined,
          input: cleanPrompt,
        };

        const response = await fetch(primaryUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(shouldUseResponses ? responsesBody : chatBody),
        });

        if ((response.status === 404 || response.status === 405) && !shouldUseResponses) {
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
          return {
            text,
            toolCalls: [],
            usedVision: false,
            usedTools: false,
          };
        }

        if (!response.ok) {
          const detail = await response.text();
          throw new Error(`LLM request failed: ${response.status} ${detail || response.statusText}`);
        }

        if (shouldUseResponses) {
          const payload = (await response.json()) as OpenAiResponsesResponse;
          const text = payload.output_text || toText(payload.output?.flatMap((entry) => entry.content || []));
          if (!text) {
            throw new Error("LLM response was empty.");
          }
          return {
            text,
            toolCalls: [],
            usedVision: false,
            usedTools: false,
          };
        }

        const payload = (await response.json()) as OpenAiChatResponse;
        const text = toText(payload.choices?.[0]?.message?.content);
        if (!text) {
          throw new Error("LLM response was empty.");
        }
        return {
          text,
          toolCalls: [],
          usedVision: false,
          usedTools: false,
        };
      }

      if (profile.kind === "azure_openai") {
        if (!profile.apiKey.trim()) {
          throw new Error("Azure OpenAI API key is required.");
        }

        const apiVersion = profile.azureApiVersion?.trim() || "2024-10-21";
        const deployment = profile.azureDeployment?.trim() || "";
        const azureBase = normalizeUrl(profile.baseUrl || "https://YOUR-RESOURCE.openai.azure.com");
        const deploymentBase =
          deployment && !/\/openai\/deployments\/[^/]+$/i.test(azureBase)
            ? `${azureBase}/openai/deployments/${encodeURIComponent(deployment)}`
            : azureBase;

        if (!/\/openai\/deployments\/[^/]+$/i.test(deploymentBase)) {
          throw new Error("Azure OpenAI deployment is required. Set deployment name or include it in base URL.");
        }

        const azureHeaders: Record<string, string> = {
          ...headers,
          "api-key": profile.apiKey,
        };
        delete azureHeaders.Authorization;

        const requestPath = profile.requestPath?.trim() || "";
        const requestedResponsesPath = Boolean(requestPath && /(^|\/)responses(\?|$)/i.test(requestPath));
        const forceChat = useVision || tools.length > 0;
        const defaultPath = forceChat ? "/chat/completions" : requestedResponsesPath ? "/responses" : "/chat/completions";
        let primaryUrl = resolveRequestUrl(deploymentBase, forceChat ? "/chat/completions" : profile.requestPath, defaultPath);
        if (!/[?&]api-version=/i.test(primaryUrl)) {
          primaryUrl = appendQueryParam(primaryUrl, "api-version", apiVersion);
        }

        if (forceChat) {
          try {
            return await runOpenAiChat(primaryUrl, azureHeaders, tools);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (tools.length > 0 && /400|422/.test(message)) {
              const fallback = await runOpenAiChat(primaryUrl, azureHeaders, []);
              return {
                ...fallback,
                text: `${fallback.text}\n\n[Tooling note] Provider rejected tool-calling payload; response returned without tools.`,
                usedTools: false,
              };
            }
            throw error;
          }
        }

        const shouldUseResponses = requestedResponsesPath;
        const chatBody = {
          model: profile.model,
          messages: [
            ...(profile.systemPrompt ? [{ role: "system", content: profile.systemPrompt }] : []),
            { role: "user", content: cleanPrompt },
          ],
          temperature: 0.2,
        };
        const responsesBody = {
          model: profile.model,
          instructions: profile.systemPrompt || undefined,
          input: cleanPrompt,
        };

        const response = await fetch(primaryUrl, {
          method: "POST",
          headers: azureHeaders,
          body: JSON.stringify(shouldUseResponses ? responsesBody : chatBody),
        });

        if ((response.status === 404 || response.status === 405) && !shouldUseResponses) {
          let fallbackUrl = resolveRequestUrl(deploymentBase, "/responses", "/responses");
          if (!/[?&]api-version=/i.test(fallbackUrl)) {
            fallbackUrl = appendQueryParam(fallbackUrl, "api-version", apiVersion);
          }
          const fallback = await fetch(fallbackUrl, {
            method: "POST",
            headers: azureHeaders,
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
          return {
            text,
            toolCalls: [],
            usedVision: false,
            usedTools: false,
          };
        }

        if (!response.ok) {
          const detail = await response.text();
          throw new Error(`LLM request failed: ${response.status} ${detail || response.statusText}`);
        }

        if (shouldUseResponses) {
          const payload = (await response.json()) as OpenAiResponsesResponse;
          const text = payload.output_text || toText(payload.output?.flatMap((entry) => entry.content || []));
          if (!text) {
            throw new Error("LLM response was empty.");
          }
          return {
            text,
            toolCalls: [],
            usedVision: false,
            usedTools: false,
          };
        }

        const payload = (await response.json()) as OpenAiChatResponse;
        const text = toText(payload.choices?.[0]?.message?.content);
        if (!text) {
          throw new Error("LLM response was empty.");
        }
        return {
          text,
          toolCalls: [],
          usedVision: false,
          usedTools: false,
        };
      }

      if (profile.kind === "ollama") {
        const baseUrl = normalizeUrl(profile.baseUrl || "http://localhost:11434");
        const enrichedPrompt = [
          cleanPrompt,
          useVision ? `\n\nImage URL: ${normalizedOptions.imageUrl}` : "",
          tools.length > 0 ? `\n\nTool context:\n${JSON.stringify(normalizedOptions.toolContext, null, 2)}` : "",
        ]
          .filter(Boolean)
          .join("");

        const requestBody = {
          model: profile.model,
          prompt: enrichedPrompt,
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
                { role: "user", content: enrichedPrompt },
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
          return {
            text: text.trim(),
            toolCalls: [],
            usedVision: useVision,
            usedTools: false,
          };
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
        return {
          text: text.trim(),
          toolCalls: [],
          usedVision: useVision,
          usedTools: false,
        };
      }

      if (profile.kind === "gemini") {
        if (!profile.apiKey.trim()) {
          throw new Error("Gemini API key is required.");
        }
        const baseUrl = normalizeUrl(profile.baseUrl || "https://generativelanguage.googleapis.com/v1beta");
        const model = profile.model.trim().replace(/^models\//, "");

        const enrichedParts: Array<Record<string, unknown>> = [{ text: cleanPrompt }];
        if (useVision) {
          enrichedParts.push({ text: `Image URL: ${normalizedOptions.imageUrl}` });
        }
        if (tools.length > 0) {
          enrichedParts.push({ text: `Tool context: ${JSON.stringify(normalizedOptions.toolContext)}` });
        }

        const response = await fetch(
          `${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(profile.apiKey)}`,
          {
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
                  parts: enrichedParts,
                },
              ],
            }),
          }
        );

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
        return {
          text: text.trim(),
          toolCalls: [],
          usedVision: useVision,
          usedTools: false,
        };
      }

      if (!profile.apiKey.trim()) {
        throw new Error("Anthropic API key is required.");
      }

      const baseUrl = normalizeUrl(profile.baseUrl || "https://api.anthropic.com");
      const enrichedPrompt = [
        cleanPrompt,
        useVision ? `\n\nImage URL: ${normalizedOptions.imageUrl}` : "",
        tools.length > 0 ? `\n\nTool context: ${JSON.stringify(normalizedOptions.toolContext)}` : "",
      ]
        .filter(Boolean)
        .join("");

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
          messages: [{ role: "user", content: enrichedPrompt }],
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
      return {
        text,
        toolCalls: [],
        usedVision: useVision,
        usedTools: false,
      };
    },
    []
  );

  const sendPrompt = useCallback(
    async (profile: LlmProfile, prompt: string, options?: LlmSendOptions): Promise<string> => {
      const response = await sendPromptDetailed(profile, prompt, options);
      return response.text;
    },
    [sendPromptDetailed]
  );

  return {
    sendPrompt,
    sendPromptDetailed,
  };
}
