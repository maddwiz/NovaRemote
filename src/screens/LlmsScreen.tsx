import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { styles } from "../theme/styles";
import { LlmProfile, LlmProviderKind, LlmSendOptions } from "../types";

type LlmsScreenProps = {
  profiles: LlmProfile[];
  activeProfileId: string | null;
  loading: boolean;
  testBusy: boolean;
  testOutput: string;
  testSummary: string;
  transferStatus: string;
  onSetActive: (id: string) => void;
  onSaveProfile: (input: Omit<LlmProfile, "id"> & { id?: string }) => void;
  onDeleteProfile: (id: string) => void;
  onTestPrompt: (profile: LlmProfile, prompt: string, options?: LlmSendOptions) => void;
  onExportEncrypted: (passphrase: string) => string;
  onImportEncrypted: (payload: string, passphrase: string) => void;
};

function parseToolContext(raw: string): Record<string, string> {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {};
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const result: Record<string, string> = {};
      Object.entries(parsed as Record<string, unknown>).forEach(([key, value]) => {
        const cleanKey = key.trim();
        const cleanValue = String(value ?? "").trim();
        if (cleanKey && cleanValue) {
          result[cleanKey] = cleanValue;
        }
      });
      return result;
    }
  } catch {
    // fall through to line parser
  }

  const result: Record<string, string> = {};
  trimmed.split(/\r?\n/).forEach((line) => {
    const clean = line.trim();
    if (!clean) {
      return;
    }
    const split = clean.indexOf(":");
    if (split <= 0) {
      return;
    }
    const key = clean.slice(0, split).trim();
    const value = clean.slice(split + 1).trim();
    if (key && value) {
      result[key] = value;
    }
  });
  return result;
}

export function LlmsScreen({
  profiles,
  activeProfileId,
  loading,
  testBusy,
  testOutput,
  testSummary,
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
      case "azure_openai":
        return "https://YOUR-RESOURCE.openai.azure.com";
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
      case "azure_openai":
        return "gpt-4o-mini";
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
  const [azureDeployment, setAzureDeployment] = useState<string>("");
  const [azureApiVersion, setAzureApiVersion] = useState<string>("2024-10-21");
  const [testPrompt, setTestPrompt] = useState<string>("Give me a one-line terminal command to list disk usage.");
  const [testVisionUrl, setTestVisionUrl] = useState<string>("");
  const [testEnableTools, setTestEnableTools] = useState<boolean>(true);
  const [testToolContextRaw, setTestToolContextRaw] = useState<string>(
    JSON.stringify(
      {
        platform: "mobile",
        app: "NovaRemote",
      },
      null,
      2
    )
  );
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
      azureDeployment?: string;
      azureApiVersion?: string;
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
    setAzureDeployment(next.azureDeployment || "");
    setAzureApiVersion(next.azureApiVersion || "2024-10-21");
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
        <Text style={styles.serverSubtitle}>Configure providers for OpenAI-compatible APIs, Azure OpenAI, Anthropic, Gemini, or native Ollama.</Text>
        {loading ? <Text style={styles.emptyText}>Loading provider profiles...</Text> : null}

        <View style={styles.actionsWrap}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Use OpenAI preset"
            accessibilityHint="Prefills provider fields for OpenAI-compatible API."
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
            accessibilityRole="button"
            accessibilityLabel="Use OpenRouter preset"
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
            accessibilityRole="button"
            accessibilityLabel="Use Groq preset"
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
            accessibilityRole="button"
            accessibilityLabel="Use xAI preset"
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
            accessibilityRole="button"
            accessibilityLabel="Use Together preset"
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
            accessibilityRole="button"
            accessibilityLabel="Use Mistral preset"
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
            accessibilityRole="button"
            accessibilityLabel="Use DeepSeek preset"
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
            accessibilityRole="button"
            accessibilityLabel="Use Azure OpenAI preset"
            style={styles.actionButton}
            onPress={() => {
              applyPreset({
                name: "Azure OpenAI",
                kind: "azure_openai",
                baseUrl: "https://YOUR-RESOURCE.openai.azure.com",
                model: "gpt-4o-mini",
                azureDeployment: "YOUR-DEPLOYMENT",
                azureApiVersion: "2024-10-21",
              });
            }}
          >
            <Text style={styles.actionButtonText}>Azure OpenAI</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Use Gemini preset"
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
            accessibilityRole="button"
            accessibilityLabel="Use Ollama preset"
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
            accessibilityRole="button"
            accessibilityLabel="Use Anthropic preset"
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
          <Pressable accessibilityRole="button"
            accessibilityLabel="Set provider type to OpenAI-compatible"
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
          <Pressable accessibilityRole="button"
            accessibilityLabel="Set provider type to Azure OpenAI"
            style={[styles.modeButton, kind === "azure_openai" ? styles.modeButtonOn : null]}
            onPress={() => {
              setKind("azure_openai");
              setBaseUrl(defaultBaseUrl("azure_openai"));
              setModel(defaultModel("azure_openai"));
              setAzureDeployment("");
              setAzureApiVersion("2024-10-21");
              setRequestPath("");
            }}
          >
            <Text style={[styles.modeButtonText, kind === "azure_openai" ? styles.modeButtonTextOn : null]}>Azure OpenAI</Text>
          </Pressable>
          <Pressable accessibilityRole="button"
            accessibilityLabel="Set provider type to Anthropic"
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
          <Pressable accessibilityRole="button"
            accessibilityLabel="Set provider type to Gemini"
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
          <Pressable accessibilityRole="button"
            accessibilityLabel="Set provider type to Ollama"
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
              : kind === "azure_openai"
                ? "https://YOUR-RESOURCE.openai.azure.com"
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

        {kind === "azure_openai" ? (
          <>
            <TextInput
              style={styles.input}
              value={azureDeployment}
              onChangeText={setAzureDeployment}
              placeholder="Azure deployment name"
              placeholderTextColor="#7f7aa8"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TextInput
              style={styles.input}
              value={azureApiVersion}
              onChangeText={setAzureApiVersion}
              placeholder="Azure API version (e.g. 2024-10-21)"
              placeholderTextColor="#7f7aa8"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </>
        ) : null}

        {kind === "openai_compatible" || kind === "azure_openai" ? (
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
            kind === "anthropic" || kind === "gemini" || kind === "azure_openai"
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
            accessibilityRole="button"
            accessibilityLabel={editingId ? "Update LLM profile" : "Save LLM profile"}
            accessibilityHint="Stores this provider profile in secure storage."
            style={[styles.buttonPrimary, styles.flexButton]}
            onPress={() => {
              if (loading) {
                return;
              }
              if (!name.trim() || !baseUrl.trim() || !model.trim()) {
                return;
              }
              if ((kind === "anthropic" || kind === "gemini" || kind === "azure_openai") && !apiKey.trim()) {
                return;
              }
              if (kind === "azure_openai" && !azureDeployment.trim()) {
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
                requestPath: kind === "openai_compatible" || kind === "azure_openai" ? requestPath : undefined,
                extraHeaders,
                azureDeployment: kind === "azure_openai" ? azureDeployment : undefined,
                azureApiVersion: kind === "azure_openai" ? azureApiVersion : undefined,
              });

              setEditingId(null);
              setName("");
              setKind("openai_compatible");
              setApiKey("");
              setBaseUrl(defaultBaseUrl("openai_compatible"));
              setModel(defaultModel("openai_compatible"));
              setSystemPrompt("");
              setRequestPath("");
              setExtraHeaders("");
              setAzureDeployment("");
              setAzureApiVersion("2024-10-21");
            }}
          >
            <Text style={styles.buttonPrimaryText}>{editingId ? "Update Profile" : "Save Profile"}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear LLM profile form"
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
              setAzureDeployment("");
              setAzureApiVersion("2024-10-21");
            }}
          >
            <Text style={styles.buttonGhostText}>Clear</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelLabel}>Saved Providers</Text>
        {loading ? (
          <Text style={styles.emptyText}>Loading saved providers...</Text>
        ) : profiles.length === 0 ? (
          <Text style={styles.emptyText}>No providers configured yet. Pick a preset above, add your key, and save.</Text>
        ) : (
          profiles.map((profile) => {
            const isActive = profile.id === activeProfileId;
            return (
              <View key={profile.id} style={[styles.serverCard, isActive ? styles.serverCardActive : null]}>
                <Text style={styles.serverName}>{profile.name}</Text>
                <Text style={styles.serverSubtitle}>{`${profile.kind} · ${profile.model}`}</Text>
                <Text style={styles.emptyText}>{profile.baseUrl}</Text>
                {profile.azureDeployment ? <Text style={styles.emptyText}>{`Deployment ${profile.azureDeployment}`}</Text> : null}
                {profile.azureApiVersion ? <Text style={styles.emptyText}>{`API ${profile.azureApiVersion}`}</Text> : null}
                {profile.requestPath ? <Text style={styles.emptyText}>{`Path ${profile.requestPath}`}</Text> : null}
                {profile.extraHeaders ? <Text style={styles.emptyText}>Custom headers configured</Text> : null}
                <View style={styles.actionsWrap}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={isActive ? `Provider ${profile.name} is active` : `Use provider ${profile.name}`}
                    style={styles.actionButton}
                    onPress={() => onSetActive(profile.id)}
                  >
                    <Text style={styles.actionButtonText}>{isActive ? "Active" : "Use"}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Edit provider ${profile.name}`}
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
                      setAzureDeployment(profile.azureDeployment || "");
                      setAzureApiVersion(profile.azureApiVersion || "2024-10-21");
                    }}
                  >
                    <Text style={styles.actionButtonText}>Edit</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Delete provider ${profile.name}`}
                    accessibilityHint="Removes this provider profile."
                    style={styles.actionDangerButton}
                    onPress={() => onDeleteProfile(profile.id)}
                  >
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
        {testSummary ? <Text style={styles.emptyText}>{testSummary}</Text> : null}
        <View style={styles.modeRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Disable LLM tool calling for this test"
            style={[styles.modeButton, !testEnableTools ? styles.modeButtonOn : null]}
            onPress={() => setTestEnableTools(false)}
          >
            <Text style={[styles.modeButtonText, !testEnableTools ? styles.modeButtonTextOn : null]}>No Tools</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Enable LLM tool calling for this test"
            style={[styles.modeButton, testEnableTools ? styles.modeButtonOn : null]}
            onPress={() => setTestEnableTools(true)}
          >
            <Text style={[styles.modeButtonText, testEnableTools ? styles.modeButtonTextOn : null]}>Built-in Tools</Text>
          </Pressable>
        </View>
        <TextInput
          style={[styles.input, styles.multilineInput]}
          value={testPrompt}
          onChangeText={setTestPrompt}
          placeholder="Prompt"
          placeholderTextColor="#7f7aa8"
          multiline
        />
        <TextInput
          style={styles.input}
          value={testVisionUrl}
          onChangeText={setTestVisionUrl}
          placeholder="Optional image URL for vision test (https://...)"
          placeholderTextColor="#7f7aa8"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {testEnableTools ? (
          <TextInput
            style={[styles.input, styles.multilineInput]}
            value={testToolContextRaw}
            onChangeText={setTestToolContextRaw}
            placeholder="Optional tool context JSON (or key:value lines)"
            placeholderTextColor="#7f7aa8"
            autoCapitalize="none"
            autoCorrect={false}
            multiline
          />
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Run LLM test prompt"
          accessibilityHint="Sends the test prompt to the active provider and shows latency and output."
          style={[styles.buttonPrimary, testBusy ? styles.buttonDisabled : null]}
          disabled={!activeProfile || testBusy || loading}
          onPress={() => {
            if (activeProfile) {
              onTestPrompt(activeProfile, testPrompt, {
                imageUrl: testVisionUrl.trim() || undefined,
                enableBuiltInTools: testEnableTools,
                toolContext: testEnableTools ? parseToolContext(testToolContextRaw) : undefined,
              });
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
            accessibilityRole="button"
            accessibilityLabel="Generate encrypted export"
            accessibilityHint="Encrypts saved provider profiles with your passphrase."
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
            accessibilityRole="button"
            accessibilityLabel="Import encrypted provider payload"
            accessibilityHint="Decrypts and merges provider profiles using your passphrase."
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
