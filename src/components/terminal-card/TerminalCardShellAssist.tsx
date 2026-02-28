import React from "react";
import { Pressable, Text, View } from "react-native";

import { styles } from "../../theme/styles";

type TerminalCardShellAssistProps = {
  session: string;
  autocomplete: string[];
  suggestionsBusy: boolean;
  suggestions: string[];
  errorHint: string | null;
  triageBusy: boolean;
  triageExplanation: string;
  triageFixes: string[];
  onDraftChange: (value: string) => void;
  onAdaptDraftForBackend: () => void;
  onRequestSuggestions: () => void;
  onUseSuggestion: (value: string) => void;
  onExplainError: () => void;
  onSuggestErrorFixes: () => void;
};

export function TerminalCardShellAssist({
  session,
  autocomplete,
  suggestionsBusy,
  suggestions,
  errorHint,
  triageBusy,
  triageExplanation,
  triageFixes,
  onDraftChange,
  onAdaptDraftForBackend,
  onRequestSuggestions,
  onUseSuggestion,
  onExplainError,
  onSuggestErrorFixes,
}: TerminalCardShellAssistProps) {
  return (
    <View style={styles.serverListWrap}>
      {autocomplete.length > 0 ? (
        <View style={styles.actionsWrap}>
          {autocomplete.map((command) => (
            <Pressable accessibilityRole="button" key={`${session}-auto-${command}`} style={styles.chip} onPress={() => onDraftChange(command)}>
              <Text style={styles.chipText}>{command}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <Pressable accessibilityRole="button" style={styles.actionButton} onPress={onAdaptDraftForBackend}>
        <Text style={styles.actionButtonText}>Adapt for Backend</Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        style={[styles.actionButton, suggestionsBusy ? styles.buttonDisabled : null]}
        onPress={onRequestSuggestions}
        disabled={suggestionsBusy}
      >
        <Text style={styles.actionButtonText}>{suggestionsBusy ? "Thinking..." : "AI Suggestions"}</Text>
      </Pressable>
      {suggestions.length > 0 ? (
        <View style={styles.actionsWrap}>
          {suggestions.map((suggestion) => (
            <Pressable accessibilityRole="button" key={`${session}-${suggestion}`} style={styles.chip} onPress={() => onUseSuggestion(suggestion)}>
              <Text style={styles.chipText}>{suggestion}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {errorHint ? (
        <View style={styles.serverCard}>
          <Text style={styles.panelLabel}>Error Triage</Text>
          <Text style={styles.emptyText}>{errorHint}</Text>
          <View style={styles.actionsWrap}>
            <Pressable accessibilityRole="button" style={[styles.actionButton, triageBusy ? styles.buttonDisabled : null]} onPress={onExplainError} disabled={triageBusy}>
              <Text style={styles.actionButtonText}>{triageBusy ? "Analyzing..." : "Explain Error"}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={[styles.actionButton, triageBusy ? styles.buttonDisabled : null]}
              onPress={onSuggestErrorFixes}
              disabled={triageBusy}
            >
              <Text style={styles.actionButtonText}>Fix Commands</Text>
            </Pressable>
          </View>
          {triageExplanation ? <Text style={styles.serverSubtitle}>{triageExplanation}</Text> : null}
          {triageFixes.length > 0 ? (
            <View style={styles.actionsWrap}>
              {triageFixes.map((command) => (
                <Pressable accessibilityRole="button" key={`${session}-triage-${command}`} style={styles.chip} onPress={() => onUseSuggestion(command)}>
                  <Text style={styles.chipText}>{command}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
