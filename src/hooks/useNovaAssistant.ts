import { useCallback, useMemo, useState } from "react";

import { makeId } from "../constants";
import { LlmProfile } from "../types";
import {
  buildNovaAssistantPrompt,
  formatNovaAssistantExecutionSummary,
  NovaAssistantAction,
  NovaAssistantExecutionResult,
  NovaAssistantMessage,
  NovaAssistantRuntimeContext,
  parseNovaAssistantPlan,
} from "../novaAssistant";

type UseNovaAssistantArgs = {
  activeProfile: LlmProfile | null;
  sendPrompt: (profile: LlmProfile, prompt: string) => Promise<string>;
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
    "I am Nova. Talk naturally and I can navigate the app, create sessions, route commands, and manage NovaAdapt agents."
  );
}

export function useNovaAssistant({ activeProfile, sendPrompt, buildContext, executeActions }: UseNovaAssistantArgs) {
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
        const prompt = buildNovaAssistantPrompt({
          history: nextHistory,
          context,
          input: trimmed,
        });
        const raw = await sendPrompt(activeProfile, prompt);
        const plan = parseNovaAssistantPlan(raw);
        const results =
          plan.actions.length > 0 ? await executeActions(plan.actions, context) : ([] as NovaAssistantExecutionResult[]);
        const finalReply = `${plan.reply.trim() || "Done."}${formatNovaAssistantExecutionSummary(results)}`.trim();
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
    [activeProfile, buildContext, executeActions, messages, sendPrompt]
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
