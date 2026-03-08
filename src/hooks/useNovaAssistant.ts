import { useCallback, useMemo, useState } from "react";

import { makeId } from "../constants";
import { LlmProfile, LlmSendOptions, LlmSendResult } from "../types";
import {
  buildNovaAssistantPrompt,
  buildNovaAssistantPlanningTool,
  buildNovaAssistantToolPrompt,
  extractNovaAssistantToolPlan,
  formatNovaAssistantExecutionSummary,
  normalizeNovaAssistantActions,
  NovaAssistantAction,
  NovaAssistantExecutionResult,
  NovaAssistantMessage,
  NovaAssistantRuntimeContext,
  parseNovaAssistantPlan,
} from "../novaAssistant";

type UseNovaAssistantArgs = {
  activeProfile: LlmProfile | null;
  sendPromptDetailed: (profile: LlmProfile, prompt: string, options?: LlmSendOptions) => Promise<LlmSendResult>;
  buildContext: () => NovaAssistantRuntimeContext;
  executeActions: (
    actions: NovaAssistantAction[],
    context: NovaAssistantRuntimeContext
  ) => Promise<NovaAssistantExecutionResult[]>;
};

type SubmitOptions = {
  clearDraft?: boolean;
};

function nowIso() {
  return new Date().toISOString();
}

function buildMessage(role: NovaAssistantMessage["role"], content: string): NovaAssistantMessage {
  return {
    id: makeId(),
    role,
    content: content.trim(),
    createdAt: nowIso(),
  };
}

function buildGreeting(): NovaAssistantMessage {
  return buildMessage(
    "assistant",
    "I am Nova. Talk naturally and I can navigate the app, manage sessions, work with files, handle team workflows, inspect processes, and coordinate NovaAdapt agents."
  );
}

function supportsNativeNovaTools(profile: LlmProfile | null): boolean {
  return profile?.kind === "openai_compatible" || profile?.kind === "azure_openai";
}

function cleanFallbackReply(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "Done.";
  }
  const withoutFence = trimmed.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
  const firstJsonBrace = withoutFence.indexOf("{");
  if (firstJsonBrace === 0) {
    return "Done.";
  }
  return withoutFence;
}

export function useNovaAssistant({ activeProfile, sendPromptDetailed, buildContext, executeActions }: UseNovaAssistantArgs) {
  const [messages, setMessages] = useState<NovaAssistantMessage[]>(() => [buildGreeting()]);
  const [draft, setDraft] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const canSend = useMemo(() => Boolean(activeProfile), [activeProfile]);

  const clearConversation = useCallback(() => {
    setMessages([buildGreeting()]);
    setLastError(null);
  }, []);

  const submit = useCallback(
    async (input: string, options?: SubmitOptions): Promise<boolean> => {
      const trimmed = input.trim();
      if (!trimmed) {
        return false;
      }
      if (!activeProfile) {
        const message = "Configure an AI provider before using Nova.";
        setLastError(message);
        setMessages((prev) => [...prev, buildMessage("assistant", message)]);
        return false;
      }

      const userMessage = buildMessage("user", trimmed);
      const nextHistory = [...messages, userMessage].slice(-12);
      setMessages(nextHistory);
      setLastError(null);
      if (options?.clearDraft !== false) {
        setDraft("");
      }
      setBusy(true);

      try {
        const context = buildContext();
        const useNativeTools = supportsNativeNovaTools(activeProfile);
        let reply = "";
        let actions: NovaAssistantAction[] = [];

        if (useNativeTools) {
          const prompt = buildNovaAssistantToolPrompt({
            history: nextHistory,
            context,
            input: trimmed,
          });
          const response = await sendPromptDetailed(activeProfile, prompt, {
            customTools: [buildNovaAssistantPlanningTool()],
            maxToolRounds: 2,
          });
          const toolPlan = extractNovaAssistantToolPlan(response.toolCalls);
          reply = response.text.trim() || toolPlan?.reply.trim() || "Done.";
          actions = normalizeNovaAssistantActions(toolPlan?.actions || [], trimmed);
        } else {
          const prompt = buildNovaAssistantPrompt({
            history: nextHistory,
            context,
            input: trimmed,
          });
          const response = await sendPromptDetailed(activeProfile, prompt, { responseFormat: "json" });
          const plan = parseNovaAssistantPlan(response.text);
          reply = cleanFallbackReply(plan.reply);
          actions = normalizeNovaAssistantActions(plan.actions, trimmed);
        }

        const results =
          actions.length > 0 ? await executeActions(actions, context) : ([] as NovaAssistantExecutionResult[]);
        const finalReply = `${reply}${formatNovaAssistantExecutionSummary(results)}`.trim();
        setMessages((prev) => [...prev, buildMessage("assistant", finalReply)]);
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setLastError(message);
        setMessages((prev) => [...prev, buildMessage("assistant", `I hit an error: ${message}`)]);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [activeProfile, buildContext, executeActions, messages, sendPromptDetailed]
  );

  const submitDraft = useCallback(async (): Promise<boolean> => {
    return await submit(draft, { clearDraft: true });
  }, [draft, submit]);

  const submitTranscript = useCallback(
    async (transcript: string, options?: { autoSend?: boolean }): Promise<boolean> => {
      const trimmed = transcript.trim();
      if (!trimmed) {
        return false;
      }
      setDraft(trimmed);
      if (options?.autoSend === false) {
        return true;
      }
      return await submit(trimmed, { clearDraft: true });
    },
    [submit]
  );

  return {
    messages,
    draft,
    setDraft,
    busy,
    lastError,
    canSend,
    clearConversation,
    submit,
    submitDraft,
    submitTranscript,
  };
}
