import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { styles } from "../theme/styles";
import { LlmProfile, LlmProviderKind } from "../types";

type LlmsScreenProps = {
  profiles: LlmProfile[];
  activeProfileId: string | null;
  testBusy: boolean;
  testOutput: string;
  transferStatus: string;
  onSetActive: (id: string) => void;
  onSaveProfile: (input: Omit<LlmProfile, "id"> & { id?: string }) => void;
  onDeleteProfile: (id: string) => void;
  onTestPrompt: (profile: LlmProfile, prompt: string) => void;
  onExportEncrypted: (passphrase: string) => string;
  onImportEncrypted: (payload: string, passphrase: string) => void;
};

export function LlmsScreen({
  profiles,
  activeProfileId,
  testBusy,
  testOutput,
  transferStatus,
  onSetActive,
  onSaveProfile,
  onDeleteProfile,
  onTestPrompt,
  onExportEncrypted,
  onImportEncrypted,
}: LlmsScreenProps) {
  const defaultBaseUrl = (provider: LlmProviderKind): string => {
    switch (provider) {
      case "anthropic":
        return "https://api.anthropic.com";
      case "gemini":
        return "https://generativelanguage.googleapis.com/v1beta";
      case "ollama":
        return "http://localhost:11434";
      case "openai_compatible":
      default:
        return "https://api.openai.com/v1";
    }
  };
  const defaultModel = (provider: LlmProviderKind): string => {
    switch (provider) {
      case "anthropic":
        return "claude-3-5-sonnet-latest";
      case "gemini":
        return "gemini-2.5-flash";
      case "ollama":
        return "llama3.1";
      case "openai_compatible":
      default:
        return "gpt-5-mini";
    }
  };

  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState<string>("");
  const [kind, setKind] = useState<LlmProviderKind>("openai_compatible");
  const [baseUrl, setBaseUrl] = useState<string>(defaultBaseUrl("openai_compatible"));
  const [apiKey, setApiKey] = useState<string>("");
  const [model, setModel] = useState<string>(defaultModel("openai_compatible"));
  const [systemPrompt, setSystemPrompt] = useState<string>("");
  const [requestPath, setRequestPath] = useState<string>("");
  const [extraHeaders, setExtraHeaders] = useState<string>("");
  const [testPrompt, setTestPrompt] = useState<string>("Give me a one-line terminal command to list disk usage.");
  const [transferPassphrase, setTransferPassphrase] = useState<string>("");
  const [importPayload, setImportPayload] = useState<string>("");
  const [exportPayload, setExportPayload] = useState<string>("");

  const applyPreset = (
    next: {
      name: string;
      kind: LlmProviderKind;
      baseUrl: string;
      model: string;
      requestPath?: string;
      extraHeaders?: string;
    },
    options?: { clearApiKey?: boolean }
  ) => {
    setEditingId(null);
    setName(next.name);
    setKind(next.kind);
    setBaseUrl(next.baseUrl);
    setModel(next.model);
    setRequestPath(next.requestPath || "");
    setExtraHeaders(next.extraHeaders || "");
    if (options?.clearApiKey) {
      setApiKey("");
    }
  };

  const activeProfile = useMemo(
    () => profiles.find((profile) => profile.id === activeProfileId) || profiles[0] || null,
    [activeProfileId, profiles]
  );

  return (
    <>
      <View style={styles.panel}>
        <Text style={styles.panelLabel}>LLM Profiles</Text>
        <Text style={styles.serverSubtitle}>Configure providers for OpenAI-compatible APIs, Anthropic, Gemini, or native Ollama.</Text>

        <View style={styles.actionsWrap}>
          <Pressable
            style={styles.actionButton}
            onPress={() => {
              applyPreset({
                name: "OpenAI",
                kind: "openai_compatible",
                baseUrl: "https://api.openai.com/v1",
                model: "gpt-5-mini",
              });
            }}
          >
            <Text style={styles.actionButtonText}>OpenAI</Text>
          </Pressable>
          <Pressable
            style={styles.actionButton}
            onPress={() => {
              applyPreset({
                name: "OpenRouter",
                kind: "openai_compatible",
                baseUrl: "https://openrouter.ai/api/v1",
                model: "openai/gpt-5-mini",
              });
            }}
          >
            <Text style={styles.actionButtonText}>OpenRouter</Text>
          </Pressable>
          <Pressable
            style={styles.actionButton}
            onPress={() => {
              applyPreset({
                name: "Groq",
                kind: "openai_compatible",
                baseUrl: "https://api.groq.com/openai/v1",
                model: "llama-3.3-70b-versatile",
              });
            }}
          >
            <Text style={styles.actionButtonText}>Groq</Text>
          </Pressable>
          <Pressable
            style={styles.actionButton}
            onPress={() => {
              applyPreset({
                name: "xAI",
                kind: "openai_compatible",
                baseUrl: "https://api.x.ai/v1",
                model: "grok-2-latest",
              });
            }}
          >
            <Text style={styles.actionButtonText}>xAI</Text>
          </Pressable>
          <Pressable
            style={styles.actionButton}
            onPress={() => {
              applyPreset({
                name: "Together",
                kind: "openai_compatible",
                baseUrl: "https://api.together.xyz/v1",
                model: "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
              });
            }}
          >
            <Text style={styles.actionButtonText}>Together</Text>
          </Pressable>
          <Pressable
            style={styles.actionButton}
            onPress={() => {
              applyPreset({
                name: "Mistral",
                kind: "openai_compatible",
                baseUrl: "https://api.mistral.ai/v1",
                model: "mistral-small-latest",
              });
            }}
          >
            <Text style={styles.actionButtonText}>Mistral</Text>
          </Pressable>
          <Pressable
            style={styles.actionButton}
            onPress={() => {
              applyPreset({
                name: "DeepSeek",
                kind: "openai_compatible",
                baseUrl: "https://api.deepseek.com/v1",
                model: "deepseek-chat",
              });
            }}
          >
            <Text style={styles.actionButtonText}>DeepSeek</Text>
          </Pressable>
          <Pressable
            style={styles.actionButton}
            onPress={() => {
              applyPreset({
                name: "Azure OpenAI",
                kind: "openai_compatible",
                baseUrl: "https://YOUR-RESOURCE.openai.azure.com/openai/deployments/YOUR-DEPLOYMENT",
                model: "gpt-4o-mini",
                requestPath: "/chat/completions?api-version=2024-10-21",
                extraHeaders: "api-key: YOUR_AZURE_OPENAI_KEY",
              });
            }}
          >
            <Text style={styles.actionButtonText}>Azure OpenAI</Text>
          </Pressable>
          <Pressable
            style={styles.actionButton}
            onPress={() => {
              applyPreset({
                name: "Gemini",
                kind: "gemini",
                baseUrl: "https://generativelanguage.googleapis.com/v1beta",
                model: "gemini-2.5-flash",
              });
            }}
          >
            <Text style={styles.actionButtonText}>Gemini</Text>
          </Pressable>
          <Pressable
            style={styles.actionButton}
            onPress={() => {
              applyPreset(
                {
                  name: "Ollama",
                  kind: "ollama",
                  baseUrl: "http://localhost:11434",
                  model: "llama3.1",
                },
                { clearApiKey: true }
              );
            }}
          >
            <Text style={styles.actionButtonText}>Ollama Native</Text>
          </Pressable>
          <Pressable
            style={styles.actionButton}
            onPress={() => {
              applyPreset({
                name: "Anthropic",
                kind: "anthropic",
                baseUrl: "https://api.anthropic.com",
                model: "claude-3-5-sonnet-latest",
              });
            }}
          >
            <Text style={styles.actionButtonText}>Anthropic</Text>
          </Pressable>
        </View>

        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Provider name"
          placeholderTextColor="#7f7aa8"
        />

        <View style={styles.modeRow}>
          <Pressable
            style={[styles.modeButton, kind === "openai_compatible" ? styles.modeButtonOn : null]}
            onPress={() => {
              setKind("openai_compatible");
              setBaseUrl(defaultBaseUrl("openai_compatible"));
              setModel(defaultModel("openai_compatible"));
              setRequestPath("");
            }}
          >
            <Text style={[styles.modeButtonText, kind === "openai_compatible" ? styles.modeButtonTextOn : null]}>OpenAI-Compatible</Text>
          </Pressable>
          <Pressable
            style={[styles.modeButton, kind === "anthropic" ? styles.modeButtonOn : null]}
            onPress={() => {
              setKind("anthropic");
              setBaseUrl(defaultBaseUrl("anthropic"));
              setModel(defaultModel("anthropic"));
              setRequestPath("");
            }}
          >
            <Text style={[styles.modeButtonText, kind === "anthropic" ? styles.modeButtonTextOn : null]}>Anthropic</Text>
          </Pressable>
          <Pressable
            style={[styles.modeButton, kind === "gemini" ? styles.modeButtonOn : null]}
            onPress={() => {
              setKind("gemini");
              setBaseUrl(defaultBaseUrl("gemini"));
              setModel(defaultModel("gemini"));
              setRequestPath("");
            }}
          >
            <Text style={[styles.modeButtonText, kind === "gemini" ? styles.modeButtonTextOn : null]}>Gemini</Text>
          </Pressable>
          <Pressable
            style={[styles.modeButton, kind === "ollama" ? styles.modeButtonOn : null]}
            onPress={() => {
              setKind("ollama");
              setBaseUrl(defaultBaseUrl("ollama"));
              setModel(defaultModel("ollama"));
              setApiKey("");
              setRequestPath("");
            }}
          >
            <Text style={[styles.modeButtonText, kind === "ollama" ? styles.modeButtonTextOn : null]}>Ollama</Text>
          </Pressable>
        </View>

        <TextInput
          style={styles.input}
          value={baseUrl}
          onChangeText={setBaseUrl}
          placeholder={
            kind === "anthropic"
              ? "https://api.anthropic.com"
              : kind === "gemini"
                ? "https://generativelanguage.googleapis.com/v1beta"
                : kind === "ollama"
                  ? "http://localhost:11434"
                  : "https://api.openai.com/v1"
          }
          placeholderTextColor="#7f7aa8"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <TextInput
          style={styles.input}
          value={model}
          onChangeText={setModel}
          placeholder="Model"
          placeholderTextColor="#7f7aa8"
          autoCapitalize="none"
          autoCorrect={false}
        />

        {kind === "openai_compatible" ? (
          <TextInput
            style={styles.input}
            value={requestPath}
            onChangeText={setRequestPath}
            placeholder="Request path override (optional, e.g. /chat/completions or /responses)"
            placeholderTextColor="#7f7aa8"
            autoCapitalize="none"
            autoCorrect={false}
          />
        ) : null}

        <TextInput
          style={styles.input}
          value={apiKey}
          onChangeText={setApiKey}
          placeholder={
            kind === "anthropic" || kind === "gemini"
              ? "API Key (required)"
              : kind === "ollama"
                ? "API Key (usually empty)"
                : "API Key (optional)"
          }
          placeholderTextColor="#7f7aa8"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />

        <TextInput
          style={[styles.input, styles.multilineInput]}
          value={extraHeaders}
          onChangeText={setExtraHeaders}
          placeholder="Optional custom headers, one per line (Header-Name: value)"
          placeholderTextColor="#7f7aa8"
          autoCapitalize="none"
          autoCorrect={false}
          multiline
        />

        <TextInput
          style={[styles.input, styles.multilineInput]}
          value={systemPrompt}
          onChangeText={setSystemPrompt}
          placeholder="Optional system prompt"
          placeholderTextColor="#7f7aa8"
          multiline
        />

        <View style={styles.rowInlineSpace}>
          <Pressable
            style={[styles.buttonPrimary, styles.flexButton]}
            onPress={() => {
              if (!name.trim() || !baseUrl.trim() || !model.trim()) {
                return;
              }
              if ((kind === "anthropic" || kind === "gemini") && !apiKey.trim()) {
                return;
              }

              onSaveProfile({
                id: editingId || undefined,
                name,
                kind,
                baseUrl,
                apiKey,
                model,
                systemPrompt,
                requestPath,
                extraHeaders,
              });

              setEditingId(null);
              setName("");
              setApiKey("");
              setBaseUrl(defaultBaseUrl("openai_compatible"));
              setModel(defaultModel("openai_compatible"));
              setSystemPrompt("");
              setRequestPath("");
              setExtraHeaders("");
            }}
          >
            <Text style={styles.buttonPrimaryText}>{editingId ? "Update Profile" : "Save Profile"}</Text>
          </Pressable>
          <Pressable
            style={[styles.buttonGhost, styles.flexButton]}
            onPress={() => {
              setEditingId(null);
              setName("");
              setKind("openai_compatible");
              setBaseUrl(defaultBaseUrl("openai_compatible"));
              setApiKey("");
              setModel(defaultModel("openai_compatible"));
              setSystemPrompt("");
              setRequestPath("");
              setExtraHeaders("");
            }}
          >
            <Text style={styles.buttonGhostText}>Clear</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelLabel}>Saved Providers</Text>
        {profiles.length === 0 ? (
          <Text style={styles.emptyText}>No providers configured yet.</Text>
        ) : (
          profiles.map((profile) => {
            const isActive = profile.id === activeProfileId;
            return (
              <View key={profile.id} style={[styles.serverCard, isActive ? styles.serverCardActive : null]}>
                <Text style={styles.serverName}>{profile.name}</Text>
                <Text style={styles.serverSubtitle}>{`${profile.kind} · ${profile.model}`}</Text>
                <Text style={styles.emptyText}>{profile.baseUrl}</Text>
                {profile.requestPath ? <Text style={styles.emptyText}>{`Path ${profile.requestPath}`}</Text> : null}
                {profile.extraHeaders ? <Text style={styles.emptyText}>Custom headers configured</Text> : null}
                <View style={styles.actionsWrap}>
                  <Pressable style={styles.actionButton} onPress={() => onSetActive(profile.id)}>
                    <Text style={styles.actionButtonText}>{isActive ? "Active" : "Use"}</Text>
                  </Pressable>
                  <Pressable
                    style={styles.actionButton}
                    onPress={() => {
                      setEditingId(profile.id);
                      setName(profile.name);
                      setKind(profile.kind);
                      setBaseUrl(profile.baseUrl);
                      setApiKey(profile.apiKey);
                      setModel(profile.model);
                      setSystemPrompt(profile.systemPrompt || "");
                      setRequestPath(profile.requestPath || "");
                      setExtraHeaders(profile.extraHeaders || "");
                    }}
                  >
                    <Text style={styles.actionButtonText}>Edit</Text>
                  </Pressable>
                  <Pressable style={styles.actionDangerButton} onPress={() => onDeleteProfile(profile.id)}>
                    <Text style={styles.actionDangerText}>Delete</Text>
                  </Pressable>
                </View>
              </View>
            );
          })
        )}
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelLabel}>Test Active Provider</Text>
        <Text style={styles.serverSubtitle}>{activeProfile ? activeProfile.name : "No active provider"}</Text>
        <TextInput
          style={[styles.input, styles.multilineInput]}
          value={testPrompt}
          onChangeText={setTestPrompt}
          placeholder="Prompt"
          placeholderTextColor="#7f7aa8"
          multiline
        />
        <Pressable
          style={[styles.buttonPrimary, testBusy ? styles.buttonDisabled : null]}
          disabled={!activeProfile || testBusy}
          onPress={() => {
            if (activeProfile) {
              onTestPrompt(activeProfile, testPrompt);
            }
          }}
        >
          <Text style={styles.buttonPrimaryText}>{testBusy ? "Testing..." : "Run Test Prompt"}</Text>
        </Pressable>

        <ScrollView style={styles.modalTerminalView}>
          <Text style={styles.terminalText}>{testOutput || "Provider output will appear here."}</Text>
        </ScrollView>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelLabel}>Encrypted Profile Transfer</Text>
        <Text style={styles.serverSubtitle}>Use a passphrase to export/import encrypted LLM profiles between devices.</Text>
        <TextInput
          style={styles.input}
          value={transferPassphrase}
          onChangeText={setTransferPassphrase}
          placeholder="Transfer passphrase"
          placeholderTextColor="#7f7aa8"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />
        <View style={styles.rowInlineSpace}>
          <Pressable
            style={[styles.buttonPrimary, styles.flexButton, !transferPassphrase.trim() ? styles.buttonDisabled : null]}
            disabled={!transferPassphrase.trim()}
            onPress={() => {
              const blob = onExportEncrypted(transferPassphrase);
              setExportPayload(blob);
            }}
          >
            <Text style={styles.buttonPrimaryText}>Generate Encrypted Export</Text>
          </Pressable>
          <Pressable
            style={[styles.buttonGhost, styles.flexButton, !transferPassphrase.trim() || !importPayload.trim() ? styles.buttonDisabled : null]}
            disabled={!transferPassphrase.trim() || !importPayload.trim()}
            onPress={() => {
              onImportEncrypted(importPayload, transferPassphrase);
              setImportPayload("");
            }}
          >
            <Text style={styles.buttonGhostText}>Import Encrypted</Text>
          </Pressable>
        </View>
        <TextInput
          style={[styles.input, styles.multilineInput]}
          value={importPayload}
          onChangeText={setImportPayload}
          placeholder="Paste encrypted payload here"
          placeholderTextColor="#7f7aa8"
          autoCapitalize="none"
          autoCorrect={false}
          multiline
        />
        <ScrollView style={styles.modalTerminalView}>
          <Text style={styles.terminalText}>{exportPayload || transferStatus || "Encrypted export payload appears here."}</Text>
        </ScrollView>
      </View>
    </>
  );
}
