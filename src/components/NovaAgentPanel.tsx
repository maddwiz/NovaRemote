import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Image, Linking, Pressable, Text, TextInput, View } from "react-native";

import { useNovaAdaptBridge } from "../hooks/useNovaAdaptBridge";
import { NovaDeviceFallbackPanel } from "./NovaDeviceFallbackPanel";
import {
  NovaAdaptBridgeCapabilities,
  NovaAdaptBridgeControlArtifact,
  NovaAdaptBridgeControlArtifactDetail,
  NovaAdaptBridgeGovernance,
  NovaAdaptBridgeHealth,
  NovaAdaptBridgeJob,
  NovaAdaptBridgeMemoryStatus,
  NovaAdaptBridgePlan,
  NovaAdaptBridgeSurfaceStatus,
  NovaAdaptBridgeTemplate,
  NovaAdaptBridgeWorkflow,
  ServerProfile,
} from "../types";
import { styles } from "../theme/styles";

type NovaAgentPanelProps = {
  server: ServerProfile | null;
  serverId: string | null;
  serverName: string | null;
  sessions: string[];
  isPro: boolean;
  onShowPaywall: () => void;
  onQueueCommand: (session: string, command: string) => void;
  onOpenAgents?: () => void;
  autoEnableLocalFallback?: boolean;
  onAutoEnableLocalFallbackHandled?: () => void;
  surface?: "preview" | "panel" | "screen";
};

const EXPECTED_COMPANION_PROTOCOL_VERSION = "2026-03-11.1";
const EXPECTED_AGENT_CONTRACT_VERSION = "2026-03-11.1";

function parseCapabilities(raw: string): string[] {
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function bridgeStatusLabel(status: string): string {
  const normalized = status.trim().toLowerCase();
  if (!normalized) {
    return "UNKNOWN";
  }
  if (normalized === "pending") {
    return "PENDING";
  }
  if (normalized === "approved") {
    return "APPROVED";
  }
  if (normalized === "executing") {
    return "EXEC";
  }
  if (normalized === "executed") {
    return "DONE";
  }
  if (normalized === "rejected") {
    return "REJECTED";
  }
  if (normalized === "failed") {
    return "FAILED";
  }
  if (normalized === "queued") {
    return "QUEUED";
  }
  if (normalized === "running") {
    return "RUNNING";
  }
  if (normalized === "paused") {
    return "PAUSED";
  }
  return normalized.replace(/_/g, " ").toUpperCase();
}

function modePillForStatus(status: string): object {
  const normalized = status.trim().toLowerCase();
  if (normalized === "failed" || normalized === "rejected") {
    return styles.modePillAi;
  }
  return styles.modePillShell;
}

function formatBridgeDate(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return null;
  }
  return new Date(timestamp).toLocaleTimeString();
}

function summarizeBridgeHealth(health: NovaAdaptBridgeHealth | null, runtimeAvailable: boolean): string {
  if (!health) {
    return runtimeAvailable ? "Runtime reachable" : "Runtime unavailable";
  }
  const featureCount =
    health.features && typeof health.features === "object"
      ? Object.values(health.features as Record<string, unknown>).filter(Boolean).length
      : 0;
  const memoryBackend =
    health.novaspine && typeof health.novaspine === "object"
      ? String((health.novaspine as Record<string, unknown>).url || "").trim()
      : "";
  const parts = [runtimeAvailable ? "Runtime online" : "Runtime unavailable"];
  if (featureCount > 0) {
    parts.push(`${featureCount} features`);
  }
  if (memoryBackend) {
    parts.push("NovaSpine linked");
  }
  if (health.protocolVersion) {
    parts.push(`Proto ${health.protocolVersion}`);
  }
  return parts.join(" • ");
}

function summarizeMemoryStatus(memoryStatus: NovaAdaptBridgeMemoryStatus | null): string {
  if (!memoryStatus) {
    return "Memory backend unavailable";
  }
  const backend = typeof memoryStatus.backend === "string" && memoryStatus.backend.trim() ? memoryStatus.backend.trim() : "default";
  const enabled = memoryStatus.enabled === false ? "disabled" : "enabled";
  return `${backend} • ${enabled}`;
}

function summarizeGovernance(governance: NovaAdaptBridgeGovernance | null): string {
  if (!governance) {
    return "Governance unavailable";
  }
  const parts = [
    governance.paused ? "Paused" : "Active",
    `${governance.activeRuns} active runs`,
    `${governance.jobs.running} running jobs`,
  ];
  if (governance.budgetLimitUsd !== null) {
    parts.push(`Budget $${governance.budgetLimitUsd.toFixed(2)}`);
  }
  return parts.join(" • ");
}

function summarizeTemplate(template: NovaAdaptBridgeTemplate): string {
  const parts = [template.strategy];
  if (template.tags.length > 0) {
    parts.push(template.tags.slice(0, 2).join(", "));
  }
  parts.push(template.source);
  return parts.join(" • ");
}

function summarizeCapabilities(capabilities: NovaAdaptBridgeCapabilities): string {
  const available: string[] = [];
  if (capabilities.workflows) {
    available.push("workflows");
  }
  if (capabilities.templates) {
    available.push("templates");
  }
  if (capabilities.templateGallery) {
    available.push("gallery");
  }
  if (capabilities.memoryStatus) {
    available.push("memory");
  }
  if (capabilities.governance) {
    available.push("governance");
  }
  if (capabilities.browserStatus) {
    available.push("browser");
  }
  if (capabilities.voiceStatus) {
    available.push("voice");
  }
  if (capabilities.canvasStatus) {
    available.push("canvas");
  }
  if (capabilities.mobileStatus) {
    available.push("mobile");
  }
  if (capabilities.homeAssistantStatus) {
    available.push("home assistant");
  }
  if (capabilities.mqttStatus) {
    available.push("mqtt");
  }
  if (capabilities.controlArtifacts) {
    available.push("artifacts");
  }
  const versions = [capabilities.protocolVersion, capabilities.agentContractVersion].filter(Boolean);
  if (available.length === 0) {
    return versions.length > 0 ? `Companion capabilities unavailable • ${versions.join(" / ")}` : "Companion capabilities unavailable.";
  }
  return versions.length > 0
    ? `Companion capabilities: ${available.join(", ")} • ${versions.join(" / ")}`
    : `Companion capabilities: ${available.join(", ")}`;
}

function summarizeSurfaceStatus(label: string, status: NovaAdaptBridgeSurfaceStatus | null): string {
  if (!status) {
    return `${label} unavailable`;
  }
  if (status.error) {
    return status.error;
  }
  const parts: string[] = [];
  if (typeof status.enabled === "boolean") {
    parts.push(status.enabled ? "enabled" : "disabled");
  } else if (status.ok) {
    parts.push("ready");
  } else {
    parts.push("unavailable");
  }
  if (typeof status.configured === "boolean") {
    parts.push(status.configured ? "configured" : "not configured");
  }
  if (status.transport) {
    parts.push(status.transport);
  }
  if (status.platform) {
    parts.push(status.platform);
  }
  if (status.backend) {
    parts.push(status.backend);
  }
  if (status.context) {
    parts.push(status.context);
  }
  return parts.join(" • ");
}

function summarizeControlArtifact(artifact: NovaAdaptBridgeControlArtifact): string {
  const parts = [artifact.controlType];
  if (artifact.transport) {
    parts.push(artifact.transport);
  }
  if (artifact.platform) {
    parts.push(artifact.platform);
  }
  if (artifact.actionType) {
    parts.push(artifact.actionType);
  }
  return parts.join(" • ");
}

function describeControlArtifact(artifact: NovaAdaptBridgeControlArtifact): string[] {
  const details: string[] = [];
  if (artifact.target) {
    details.push(`Target ${artifact.target}`);
  }
  if (artifact.model) {
    details.push(`Model ${artifact.model}`);
  }
  if (artifact.modelId) {
    details.push(`Model ID ${artifact.modelId}`);
  }
  if (artifact.createdAt) {
    const createdAt = formatBridgeDate(artifact.createdAt);
    if (createdAt) {
      details.push(`Created ${createdAt}`);
    }
  }
  if (artifact.dangerous) {
    details.push("Marked dangerous");
  }
  return details;
}

function buildArtifactUrl(serverBaseUrl: string | null, path: string | null | undefined): string | null {
  if (!path) {
    return null;
  }
  const trimmed = path.trim();
  if (!trimmed) {
    return null;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (!serverBaseUrl) {
    return null;
  }
  const normalizedBase = serverBaseUrl.replace(/\/+$/, "");
  const normalizedPath = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return `${normalizedBase}${normalizedPath}`;
}

function formatArtifactPayload(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized || null;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function recordString(record: Record<string, unknown> | null, key: string): string | null {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function artifactMimeType(detail: NovaAdaptBridgeControlArtifactDetail | null): string | null {
  return (
    recordString(detail?.metadata ?? null, "mime_type") ||
    recordString(detail?.metadata ?? null, "content_type") ||
    recordString(detail?.data ?? null, "mime_type") ||
    recordString(detail?.data ?? null, "content_type")
  );
}

function isImageMimeType(value: string | null): boolean {
  return typeof value === "string" && /^image\//i.test(value);
}

function isJsonMimeType(value: string | null): boolean {
  return typeof value === "string" && /(\/|\\b)(json|ndjson)(;|$)/i.test(value);
}

function isTextMimeType(value: string | null): boolean {
  return (
    typeof value === "string" &&
    (/^text\//i.test(value) || /(xml|yaml|csv|html|javascript|typescript|markdown|plain)/i.test(value))
  );
}

function isCodeMimeType(value: string | null): boolean {
  return (
    typeof value === "string" &&
    /(javascript|typescript|python|x-python|java|x-java|go|x-go|rust|x-rust|shell|x-shellscript|jsonc|toml|yaml|x-yaml|xml|html|css|x-csrc|x-c\+\+src|x-ruby)/i.test(
      value
    )
  );
}

function isLogMimeType(value: string | null): boolean {
  return typeof value === "string" && /(x-log|logfile|journal|syslog|event-stream)/i.test(value);
}

function looksLikeLogOutput(value: string | null): boolean {
  if (!value) {
    return false;
  }
  const sample = value.trim();
  if (!sample) {
    return false;
  }
  return /(\d{4}-\d{2}-\d{2}|\bINFO\b|\bWARN\b|\bERROR\b|\bDEBUG\b|\bTRACE\b|\blog\b)/i.test(sample);
}

function tryFormatJsonString(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return null;
  }
}

type ArtifactRenderKind = "image" | "json" | "code" | "log" | "text" | "binary" | "empty";

function artifactRenderKind(args: {
  mimeType: string | null;
  hasImagePreview: boolean;
  output: string | null;
  detail: NovaAdaptBridgeControlArtifactDetail | null;
  previewUrl: string | null;
}): ArtifactRenderKind {
  if (args.hasImagePreview) {
    return "image";
  }
  if (isJsonMimeType(args.mimeType) || tryFormatJsonString(args.output) || typeof args.detail?.data === "object") {
    return "json";
  }
  if (isCodeMimeType(args.mimeType) || (/```/.test(args.output ?? "") && !!args.output)) {
    return "code";
  }
  if (isLogMimeType(args.mimeType) || looksLikeLogOutput(args.output)) {
    return "log";
  }
  if (isTextMimeType(args.mimeType) || args.output) {
    return "text";
  }
  if (args.previewUrl) {
    return "binary";
  }
  return "empty";
}

function buildCompatibilityWarning(
  capabilities: NovaAdaptBridgeCapabilities,
  health: NovaAdaptBridgeHealth | null
): string | null {
  const protocolVersion = capabilities.protocolVersion || health?.protocolVersion || null;
  const agentContractVersion = capabilities.agentContractVersion || health?.agentContractVersion || null;
  if (!protocolVersion && !agentContractVersion) {
    return null;
  }

  const mismatches: string[] = [];
  if (protocolVersion && protocolVersion !== EXPECTED_COMPANION_PROTOCOL_VERSION) {
    mismatches.push(`protocol ${protocolVersion}`);
  }
  if (agentContractVersion && agentContractVersion !== EXPECTED_AGENT_CONTRACT_VERSION) {
    mismatches.push(`agent contract ${agentContractVersion}`);
  }
  if (mismatches.length === 0) {
    return null;
  }
  return `Companion update recommended: ${mismatches.join(" • ")}`;
}

function canApprovePlan(status: string): boolean {
  return status.trim().toLowerCase() === "pending";
}

function canRejectPlan(status: string): boolean {
  return ["pending", "approved"].includes(status.trim().toLowerCase());
}

function canRetryPlan(status: string): boolean {
  return status.trim().toLowerCase() === "failed";
}

function canUndoPlan(status: string): boolean {
  return ["approved", "executed", "rejected", "failed"].includes(status.trim().toLowerCase());
}

function canResumeWorkflow(status: string): boolean {
  const normalized = status.trim().toLowerCase();
  return normalized !== "running" && normalized !== "done";
}

function RemoteBridgeSection({
  loading,
  refreshing,
  supported,
  runtimeAvailable,
  capabilities,
  error,
  health,
  memoryStatus,
  browserStatus,
  voiceStatus,
  canvasStatus,
  mobileStatus,
  homeAssistantStatus,
  mqttStatus,
  controlArtifacts,
  governance,
  plans,
  jobs,
  workflows,
  templates,
  galleryTemplates,
  templateMutationKey,
  mutationPlanId,
  mutationWorkflowId,
  governanceBusy,
  serverBaseUrl,
  serverToken,
  onRefresh,
  onApprovePlan,
  onRejectPlan,
  onRetryPlan,
  onUndoPlan,
  onResumeWorkflow,
  onPauseRuntime,
  onResumeRuntime,
  onResetGovernanceUsage,
  onCancelAllJobs,
  onLaunchTemplate,
  onLoadControlArtifact,
}: {
  loading: boolean;
  refreshing: boolean;
  supported: boolean;
  runtimeAvailable: boolean;
  capabilities: NovaAdaptBridgeCapabilities;
  error: string | null;
  health: NovaAdaptBridgeHealth | null;
  memoryStatus: NovaAdaptBridgeMemoryStatus | null;
  browserStatus: NovaAdaptBridgeSurfaceStatus | null;
  voiceStatus: NovaAdaptBridgeSurfaceStatus | null;
  canvasStatus: NovaAdaptBridgeSurfaceStatus | null;
  mobileStatus: NovaAdaptBridgeSurfaceStatus | null;
  homeAssistantStatus: NovaAdaptBridgeSurfaceStatus | null;
  mqttStatus: NovaAdaptBridgeSurfaceStatus | null;
  controlArtifacts: NovaAdaptBridgeControlArtifact[];
  governance: NovaAdaptBridgeGovernance | null;
  plans: NovaAdaptBridgePlan[];
  jobs: NovaAdaptBridgeJob[];
  workflows: NovaAdaptBridgeWorkflow[];
  templates: NovaAdaptBridgeTemplate[];
  galleryTemplates: NovaAdaptBridgeTemplate[];
  templateMutationKey: string | null;
  mutationPlanId: string | null;
  mutationWorkflowId: string | null;
  governanceBusy: boolean;
  serverBaseUrl: string | null;
  serverToken: string | null;
  onRefresh: () => void;
  onApprovePlan: (planId: string) => void;
  onRejectPlan: (planId: string) => void;
  onRetryPlan: (planId: string) => void;
  onUndoPlan: (planId: string) => void;
  onResumeWorkflow: (workflowId: string) => void;
  onPauseRuntime: () => void;
  onResumeRuntime: () => void;
  onResetGovernanceUsage: () => void;
  onCancelAllJobs: () => void;
  onLaunchTemplate: (template: NovaAdaptBridgeTemplate, mode: "plan" | "workflow") => void;
  onLoadControlArtifact: (artifactId: string) => Promise<NovaAdaptBridgeControlArtifactDetail | null>;
}) {
  const compatibilityWarning = buildCompatibilityWarning(capabilities, health);
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
  const [artifactViewMode, setArtifactViewMode] = useState<"preview" | "details">("preview");
  const [selectedArtifactDetail, setSelectedArtifactDetail] = useState<NovaAdaptBridgeControlArtifactDetail | null>(null);
  const [artifactDetailLoading, setArtifactDetailLoading] = useState(false);
  const [artifactDetailError, setArtifactDetailError] = useState<string | null>(null);
  const controlSurfaces = [
    { key: "browser", title: "Browser", enabled: capabilities.browserStatus, status: browserStatus },
    { key: "voice", title: "Voice", enabled: capabilities.voiceStatus, status: voiceStatus },
    { key: "canvas", title: "Canvas", enabled: capabilities.canvasStatus, status: canvasStatus },
    { key: "mobile", title: "Mobile", enabled: capabilities.mobileStatus, status: mobileStatus },
    { key: "homeassistant", title: "Home Assistant", enabled: capabilities.homeAssistantStatus, status: homeAssistantStatus },
    { key: "mqtt", title: "MQTT", enabled: capabilities.mqttStatus, status: mqttStatus },
  ];
  const visibleControlSurfaces = controlSurfaces.filter((surface) => surface.enabled || surface.status);
  const visibleArtifacts = controlArtifacts.slice(0, 4);
  const selectedArtifact =
    visibleArtifacts.find((artifact) => artifact.artifactId === selectedArtifactId) || visibleArtifacts[0] || null;
  const selectedPreviewUrl = selectedArtifact ? buildArtifactUrl(serverBaseUrl, selectedArtifact.previewPath) : null;
  const selectedDetailUrl = selectedArtifact ? buildArtifactUrl(serverBaseUrl, selectedArtifact.detailPath) : null;
  const selectedArtifactDetails = selectedArtifact ? describeControlArtifact(selectedArtifact) : [];
  const selectedArtifactOutput =
    (selectedArtifactDetail?.output && selectedArtifactDetail.output.trim()) || selectedArtifact?.outputPreview || null;
  const selectedArtifactAction = formatArtifactPayload(selectedArtifactDetail?.action);
  const selectedArtifactData = formatArtifactPayload(selectedArtifactDetail?.data);
  const selectedArtifactMetadata = formatArtifactPayload(selectedArtifactDetail?.metadata);
  const selectedArtifactMimeType = artifactMimeType(selectedArtifactDetail);
  const selectedArtifactIsImage = isImageMimeType(selectedArtifactMimeType) && Boolean(selectedPreviewUrl);
  const selectedArtifactRenderType = artifactRenderKind({
    mimeType: selectedArtifactMimeType,
    hasImagePreview: selectedArtifactIsImage,
    output: selectedArtifactOutput,
    detail: selectedArtifactDetail,
    previewUrl: selectedPreviewUrl,
  });
  const selectedArtifactJson =
    tryFormatJsonString(selectedArtifactOutput) ||
    (selectedArtifactDetail?.data ? formatArtifactPayload(selectedArtifactDetail.data) : null);

  useEffect(() => {
    let active = true;
    if (!selectedArtifact) {
      setSelectedArtifactDetail(null);
      setArtifactDetailError(null);
      setArtifactDetailLoading(false);
      return () => {
        active = false;
      };
    }
    setArtifactDetailLoading(true);
    setArtifactDetailError(null);
    setSelectedArtifactDetail(null);
    void onLoadControlArtifact(selectedArtifact.artifactId)
      .then((detail) => {
        if (!active) {
          return;
        }
        setSelectedArtifactDetail(detail);
      })
      .catch((nextError) => {
        if (!active) {
          return;
        }
        const detail = nextError instanceof Error ? nextError.message : String(nextError || "Unknown error");
        setArtifactDetailError(detail);
      })
      .finally(() => {
        if (!active) {
          return;
        }
        setArtifactDetailLoading(false);
      });
    return () => {
      active = false;
    };
  }, [onLoadControlArtifact, selectedArtifact]);

  return (
    <View style={styles.panel}>
      <View style={styles.rowInlineSpace}>
        <Text style={styles.panelLabel}>Server Runtime</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh NovaAdapt runtime"
          style={[styles.actionButton, loading || refreshing ? styles.buttonDisabled : null]}
          disabled={loading || refreshing}
          onPress={onRefresh}
        >
          <Text style={styles.actionButtonText}>{loading || refreshing ? "Refreshing..." : "Refresh"}</Text>
        </Pressable>
      </View>
      {!supported ? (
        <Text style={styles.emptyText}>
          {loading ? "Checking server runtime..." : "Server runtime is not enabled on this companion server yet."}
        </Text>
      ) : (
        <>
          <Text style={styles.serverSubtitle}>{summarizeBridgeHealth(health, runtimeAvailable)}</Text>
          {compatibilityWarning ? <Text style={styles.emptyText}>{compatibilityWarning}</Text> : null}
          <Text style={styles.emptyText}>
            {capabilities.memoryStatus ? `Memory ${summarizeMemoryStatus(memoryStatus)}` : "Memory status unavailable on this runtime."}
          </Text>
          {error ? <Text style={styles.emptyText}>{`Runtime error: ${error}`}</Text> : null}

          <View style={styles.panel}>
            <Text style={styles.panelLabel}>Control Surfaces</Text>
            {visibleControlSurfaces.length === 0 ? (
              <Text style={styles.emptyText}>This server runtime does not expose control surfaces yet.</Text>
            ) : (
              visibleControlSurfaces.map((surface) => (
                <View key={`bridge-surface-${surface.key}`} style={styles.terminalCard}>
                  <View style={styles.terminalNameRow}>
                    <Text style={styles.terminalName}>{surface.title}</Text>
                    <Text style={[styles.modePill, surface.status?.ok ? styles.modePillShell : styles.modePillAi]}>
                      {surface.status?.ok ? "READY" : "LIMITED"}
                    </Text>
                  </View>
                  <Text style={styles.serverSubtitle}>{summarizeSurfaceStatus(surface.title, surface.status)}</Text>
                </View>
              ))
            )}
          </View>

          {!capabilities.governance ? (
            <View style={styles.panel}>
              <Text style={styles.panelLabel}>Runtime Governance</Text>
              <Text style={styles.emptyText}>This server runtime does not expose governance controls yet.</Text>
            </View>
          ) : governance ? (
            <View style={styles.panel}>
              <Text style={styles.panelLabel}>Runtime Governance</Text>
              <Text style={styles.serverSubtitle}>{summarizeGovernance(governance)}</Text>
              <Text style={styles.emptyText}>
                {`Spend $${governance.spendEstimateUsd.toFixed(2)} • LLM calls ${governance.llmCallsTotal} • Runs ${governance.runsTotal}`}
              </Text>
              {governance.pauseReason ? <Text style={styles.emptyText}>{`Reason ${governance.pauseReason}`}</Text> : null}
              {governance.lastObjectivePreview ? (
                <Text style={styles.emptyText}>{`Last objective ${governance.lastObjectivePreview}`}</Text>
              ) : null}
              <View style={styles.actionsWrap}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={governance.paused ? "Resume runtime governance" : "Pause runtime governance"}
                  style={[styles.actionButton, governanceBusy ? styles.buttonDisabled : null]}
                  disabled={governanceBusy}
                  onPress={governance.paused ? onResumeRuntime : onPauseRuntime}
                >
                  <Text style={styles.actionButtonText}>{governance.paused ? "Resume Runtime" : "Pause Runtime"}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Reset runtime governance usage"
                  style={[styles.actionButton, governanceBusy ? styles.buttonDisabled : null]}
                  disabled={governanceBusy}
                  onPress={onResetGovernanceUsage}
                >
                  <Text style={styles.actionButtonText}>Reset Usage</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Cancel all runtime jobs"
                  style={[styles.actionDangerButton, governanceBusy ? styles.buttonDisabled : null]}
                  disabled={governanceBusy}
                  onPress={onCancelAllJobs}
                >
                  <Text style={styles.actionDangerText}>Cancel All Jobs</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          <View style={styles.panel}>
            <Text style={styles.panelLabel}>Plans</Text>
            {plans.length === 0 ? (
              <Text style={styles.emptyText}>No server plans yet.</Text>
            ) : (
              plans.slice(0, 4).map((plan) => {
                const progressLabel =
                  plan.progressTotal > 0 ? `${plan.progressCompleted}/${plan.progressTotal}` : `${plan.progressCompleted}`;
                const updatedAt = formatBridgeDate(plan.updatedAt || plan.createdAt);
                const busy = mutationPlanId === plan.id;
                return (
                  <View key={`bridge-plan-${plan.id}`} style={styles.terminalCard}>
                    <View style={styles.terminalNameRow}>
                      <Text style={styles.terminalName}>{plan.objective}</Text>
                      <Text style={[styles.modePill, modePillForStatus(plan.status)]}>{bridgeStatusLabel(plan.status)}</Text>
                    </View>
                    <Text style={styles.serverSubtitle}>{`Plan ${plan.id}`}</Text>
                    <Text style={styles.emptyText}>{`Progress ${progressLabel}${updatedAt ? ` • ${updatedAt}` : ""}`}</Text>
                    {plan.executionError ? <Text style={styles.emptyText}>{`Error ${plan.executionError}`}</Text> : null}
                    {plan.rejectReason ? <Text style={styles.emptyText}>{`Rejected ${plan.rejectReason}`}</Text> : null}
                    <View style={styles.actionsWrap}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Approve plan ${plan.id}`}
                        style={[styles.actionButton, !canApprovePlan(plan.status) || busy ? styles.buttonDisabled : null]}
                        disabled={!canApprovePlan(plan.status) || busy}
                        onPress={() => onApprovePlan(plan.id)}
                      >
                        <Text style={styles.actionButtonText}>Approve</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Retry plan ${plan.id}`}
                        style={[styles.actionButton, !canRetryPlan(plan.status) || busy ? styles.buttonDisabled : null]}
                        disabled={!canRetryPlan(plan.status) || busy}
                        onPress={() => onRetryPlan(plan.id)}
                      >
                        <Text style={styles.actionButtonText}>Retry</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Undo plan ${plan.id}`}
                        style={[styles.actionButton, !canUndoPlan(plan.status) || busy ? styles.buttonDisabled : null]}
                        disabled={!canUndoPlan(plan.status) || busy}
                        onPress={() => onUndoPlan(plan.id)}
                      >
                        <Text style={styles.actionButtonText}>Undo</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Reject plan ${plan.id}`}
                        style={[styles.actionDangerButton, !canRejectPlan(plan.status) || busy ? styles.buttonDisabled : null]}
                        disabled={!canRejectPlan(plan.status) || busy}
                        onPress={() => onRejectPlan(plan.id)}
                      >
                        <Text style={styles.actionDangerText}>Reject</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })
            )}
          </View>

          {capabilities.workflows ? (
            <View style={styles.panel}>
              <Text style={styles.panelLabel}>Workflows</Text>
              {workflows.length === 0 ? (
                <Text style={styles.emptyText}>No server workflows yet.</Text>
              ) : (
                workflows.slice(0, 4).map((workflow) => (
                  <View key={`bridge-workflow-${workflow.workflowId}`} style={styles.terminalCard}>
                    <View style={styles.terminalNameRow}>
                      <Text style={styles.terminalName}>{workflow.objective}</Text>
                      <Text style={[styles.modePill, modePillForStatus(workflow.status)]}>{bridgeStatusLabel(workflow.status)}</Text>
                    </View>
                    <Text style={styles.serverSubtitle}>{`Workflow ${workflow.workflowId}`}</Text>
                    <Text style={styles.emptyText}>{formatBridgeDate(workflow.updatedAt) ? `Updated ${formatBridgeDate(workflow.updatedAt)}` : "Awaiting activity"}</Text>
                    {workflow.lastError ? <Text style={styles.emptyText}>{`Error ${workflow.lastError}`}</Text> : null}
                    <View style={styles.actionsWrap}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Resume workflow ${workflow.workflowId}`}
                        style={[
                          styles.actionButton,
                          !canResumeWorkflow(workflow.status) || mutationWorkflowId === workflow.workflowId
                            ? styles.buttonDisabled
                            : null,
                        ]}
                        disabled={!canResumeWorkflow(workflow.status) || mutationWorkflowId === workflow.workflowId}
                        onPress={() => onResumeWorkflow(workflow.workflowId)}
                      >
                        <Text style={styles.actionButtonText}>
                          {mutationWorkflowId === workflow.workflowId ? "Resuming..." : "Resume"}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                ))
              )}
            </View>
          ) : (
            <View style={styles.panel}>
              <Text style={styles.panelLabel}>Workflows</Text>
              <Text style={styles.emptyText}>This server runtime does not expose workflow controls yet.</Text>
            </View>
          )}

          <View style={styles.panel}>
            <Text style={styles.panelLabel}>Jobs</Text>
            {jobs.length === 0 ? (
              <Text style={styles.emptyText}>No server jobs yet.</Text>
            ) : (
              jobs.slice(0, 4).map((job) => (
                <View key={`bridge-job-${job.id}`} style={styles.terminalCard}>
                  <View style={styles.terminalNameRow}>
                    <Text style={styles.terminalName}>{job.id}</Text>
                    <Text style={[styles.modePill, modePillForStatus(job.status)]}>{bridgeStatusLabel(job.status)}</Text>
                  </View>
                  <Text style={styles.serverSubtitle}>
                    {`Created ${formatBridgeDate(job.createdAt) || "unknown"}${formatBridgeDate(job.finishedAt) ? ` • Finished ${formatBridgeDate(job.finishedAt)}` : ""}`}
                  </Text>
                  {job.error ? <Text style={styles.emptyText}>{`Error ${job.error}`}</Text> : null}
                </View>
              ))
            )}
          </View>

          <View style={styles.panel}>
            <Text style={styles.panelLabel}>Control Artifacts</Text>
            {visibleArtifacts.length === 0 ? (
              <Text style={styles.emptyText}>
                {capabilities.controlArtifacts
                  ? "No recent control artifacts yet."
                  : "This server runtime does not expose control artifacts yet."}
              </Text>
            ) : (
              <>
                {visibleArtifacts.map((artifact) => (
                  <Pressable
                    key={`bridge-artifact-${artifact.artifactId}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Select artifact ${artifact.artifactId}`}
                    style={[
                      styles.terminalCard,
                      artifact.artifactId === selectedArtifact?.artifactId ? styles.chipActive : null,
                    ]}
                    onPress={() => {
                      setSelectedArtifactId(artifact.artifactId);
                    }}
                  >
                    <View style={styles.terminalNameRow}>
                      <Text style={styles.terminalName}>{artifact.goal || artifact.artifactId}</Text>
                      <Text style={[styles.modePill, modePillForStatus(artifact.status)]}>
                        {bridgeStatusLabel(artifact.status)}
                      </Text>
                    </View>
                    <Text style={styles.serverSubtitle}>{summarizeControlArtifact(artifact)}</Text>
                    <Text style={styles.emptyText}>
                      {artifact.outputPreview ||
                        artifact.target ||
                        artifact.model ||
                        `Artifact ${artifact.artifactId}`}
                    </Text>
                  </Pressable>
                ))}
                {selectedArtifact ? (
                  <View style={styles.terminalCard}>
                    <View style={styles.terminalNameRow}>
                      <Text style={styles.terminalName}>
                        {artifactViewMode === "preview" ? "Artifact Preview" : "Artifact Details"}
                      </Text>
                      <Text style={[styles.modePill, modePillForStatus(selectedArtifact.status)]}>
                        {bridgeStatusLabel(selectedArtifact.status)}
                      </Text>
                    </View>
                    <Text style={styles.serverSubtitle}>
                      {selectedArtifact.goal || selectedArtifact.artifactId}
                    </Text>
                    <View style={styles.actionsWrap}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Show preview for artifact ${selectedArtifact.artifactId}`}
                        style={[styles.actionButton, artifactViewMode === "preview" ? styles.chipActive : null]}
                        onPress={() => setArtifactViewMode("preview")}
                      >
                        <Text style={styles.actionButtonText}>Preview</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Show details for artifact ${selectedArtifact.artifactId}`}
                        style={[styles.actionButton, artifactViewMode === "details" ? styles.chipActive : null]}
                        onPress={() => setArtifactViewMode("details")}
                      >
                        <Text style={styles.actionButtonText}>Details</Text>
                      </Pressable>
                      {artifactViewMode === "preview" && selectedPreviewUrl ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Open preview url for artifact ${selectedArtifact.artifactId}`}
                          style={styles.actionButton}
                          onPress={() => {
                            void Linking.openURL(selectedPreviewUrl);
                          }}
                        >
                          <Text style={styles.actionButtonText}>Open Preview</Text>
                        </Pressable>
                      ) : null}
                      {artifactViewMode === "details" && selectedDetailUrl ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Open detail url for artifact ${selectedArtifact.artifactId}`}
                          style={styles.actionButton}
                          onPress={() => {
                            void Linking.openURL(selectedDetailUrl);
                          }}
                        >
                          <Text style={styles.actionButtonText}>Open Details</Text>
                        </Pressable>
                      ) : null}
                    </View>
                    {artifactViewMode === "preview" ? (
                      <>
                        {artifactDetailLoading ? <Text style={styles.emptyText}>Loading artifact preview...</Text> : null}
                        {selectedArtifactRenderType === "image" && selectedPreviewUrl ? (
                          <Image
                            accessibilityLabel={`Inline preview for artifact ${selectedArtifact.artifactId}`}
                            source={{
                              uri: selectedPreviewUrl,
                              ...(serverToken ? { headers: { Authorization: `Bearer ${serverToken}` } } : {}),
                            }}
                            style={{
                              width: "100%",
                              height: 180,
                              borderRadius: 20,
                              marginTop: 8,
                              marginBottom: 8,
                              backgroundColor: "rgba(7, 10, 24, 0.95)",
                            }}
                            resizeMode="cover"
                          />
                        ) : null}
                        {selectedArtifactRenderType === "json" && selectedArtifactJson ? (
                          <>
                            <Text style={styles.panelLabel}>JSON Preview</Text>
                            <View style={styles.terminalView}>
                              <Text style={styles.terminalText}>{selectedArtifactJson}</Text>
                            </View>
                          </>
                        ) : null}
                        {selectedArtifactRenderType === "code" && selectedArtifactOutput ? (
                          <>
                            <Text style={styles.panelLabel}>Code Preview</Text>
                            <View style={styles.terminalView}>
                              <Text style={styles.terminalText}>{selectedArtifactOutput}</Text>
                            </View>
                          </>
                        ) : null}
                        {selectedArtifactRenderType === "log" && selectedArtifactOutput ? (
                          <>
                            <Text style={styles.panelLabel}>Log Preview</Text>
                            <View style={styles.terminalView}>
                              <Text style={styles.terminalText}>{selectedArtifactOutput}</Text>
                            </View>
                          </>
                        ) : null}
                        {selectedArtifactRenderType === "text" && selectedArtifactOutput ? (
                          <>
                            <Text style={styles.panelLabel}>Text Preview</Text>
                            <View style={styles.terminalView}>
                              <Text style={styles.terminalText}>{selectedArtifactOutput}</Text>
                            </View>
                          </>
                        ) : null}
                        {selectedArtifactRenderType === "binary" && !artifactDetailLoading ? (
                          <Text style={styles.emptyText}>
                            Binary artifact preview is available from the companion endpoint. Use Open Preview for the rendered view.
                          </Text>
                        ) : null}
                        {selectedArtifactRenderType === "empty" && !artifactDetailLoading ? (
                          <Text style={styles.emptyText}>
                            No inline preview text was returned for this artifact. Use Open Preview for the server-rendered view.
                          </Text>
                        ) : null}
                        {artifactDetailError ? <Text style={styles.emptyText}>{`Artifact detail error: ${artifactDetailError}`}</Text> : null}
                      </>
                    ) : (
                      <>
                        <Text style={styles.emptyText}>{summarizeControlArtifact(selectedArtifact)}</Text>
                        {selectedArtifactDetails.map((detail) => (
                          <Text key={`${selectedArtifact.artifactId}-${detail}`} style={styles.emptyText}>
                            {detail}
                          </Text>
                        ))}
                        {selectedArtifactMimeType ? (
                          <Text style={styles.emptyText}>{`Type ${selectedArtifactMimeType}`}</Text>
                        ) : null}
                        {artifactDetailLoading ? <Text style={styles.emptyText}>Loading artifact details...</Text> : null}
                        {selectedArtifactRenderType === "image" && selectedPreviewUrl ? (
                          <>
                            <Text style={styles.panelLabel}>Image</Text>
                            <Image
                              accessibilityLabel={`Detailed image for artifact ${selectedArtifact.artifactId}`}
                              source={{
                                uri: selectedPreviewUrl,
                                ...(serverToken ? { headers: { Authorization: `Bearer ${serverToken}` } } : {}),
                              }}
                              style={{
                                width: "100%",
                                height: 180,
                                borderRadius: 20,
                                marginTop: 8,
                                marginBottom: 8,
                                backgroundColor: "rgba(7, 10, 24, 0.95)",
                              }}
                              resizeMode="cover"
                            />
                          </>
                        ) : null}
                        {selectedArtifactRenderType === "json" && selectedArtifactJson ? (
                          <>
                            <Text style={styles.panelLabel}>JSON</Text>
                            <View style={styles.terminalView}>
                              <Text style={styles.terminalText}>{selectedArtifactJson}</Text>
                            </View>
                          </>
                        ) : null}
                        {selectedArtifactRenderType === "code" && selectedArtifactOutput ? (
                          <>
                            <Text style={styles.panelLabel}>Code</Text>
                            <View style={styles.terminalView}>
                              <Text style={styles.terminalText}>{selectedArtifactOutput}</Text>
                            </View>
                          </>
                        ) : null}
                        {selectedArtifactRenderType === "log" && selectedArtifactOutput ? (
                          <>
                            <Text style={styles.panelLabel}>Log Output</Text>
                            <View style={styles.terminalView}>
                              <Text style={styles.terminalText}>{selectedArtifactOutput}</Text>
                            </View>
                          </>
                        ) : null}
                        {selectedArtifactRenderType === "text" && selectedArtifactOutput ? (
                          <>
                            <Text style={styles.panelLabel}>Output</Text>
                            <View style={styles.terminalView}>
                              <Text style={styles.terminalText}>{selectedArtifactOutput}</Text>
                            </View>
                          </>
                        ) : null}
                        {selectedArtifactRenderType === "binary" ? (
                          <Text style={styles.emptyText}>
                            Binary artifact metadata is available below. Use Open Details or Open Preview for the full payload.
                          </Text>
                        ) : null}
                        {selectedArtifactAction ? (
                          <>
                            <Text style={styles.panelLabel}>Action</Text>
                            <View style={styles.terminalView}>
                              <Text style={styles.terminalText}>{selectedArtifactAction}</Text>
                            </View>
                          </>
                        ) : null}
                        {selectedArtifactData ? (
                          <>
                            <Text style={styles.panelLabel}>Data</Text>
                            <View style={styles.terminalView}>
                              <Text style={styles.terminalText}>{selectedArtifactData}</Text>
                            </View>
                          </>
                        ) : null}
                        {selectedArtifactMetadata ? (
                          <>
                            <Text style={styles.panelLabel}>Metadata</Text>
                            <View style={styles.terminalView}>
                              <Text style={styles.terminalText}>{selectedArtifactMetadata}</Text>
                            </View>
                          </>
                        ) : null}
                        {artifactDetailError ? <Text style={styles.emptyText}>{`Artifact detail error: ${artifactDetailError}`}</Text> : null}
                        {!selectedArtifactDetails.length &&
                        !selectedArtifactOutput &&
                        !selectedArtifactJson &&
                        !selectedArtifactAction &&
                        !selectedArtifactData &&
                        !selectedArtifactMetadata &&
                        !artifactDetailLoading ? (
                          <Text style={styles.emptyText}>No additional detail fields were returned for this artifact.</Text>
                        ) : null}
                      </>
                    )}
                  </View>
                ) : null}
              </>
            )}
          </View>

          {!capabilities.templates ? (
            <View style={styles.panel}>
              <Text style={styles.panelLabel}>Saved Templates</Text>
              <Text style={styles.emptyText}>This bridge does not expose saved template routes yet.</Text>
            </View>
          ) : (
            <View style={styles.panel}>
              <Text style={styles.panelLabel}>Saved Templates</Text>
              {templates.length === 0 ? (
                <Text style={styles.emptyText}>No saved server templates yet.</Text>
              ) : (
                templates.slice(0, 4).map((template) => {
                  const busy = templateMutationKey === `${template.templateId}:saved`;
                  return (
                    <View key={`bridge-template-${template.templateId}`} style={styles.terminalCard}>
                      <View style={styles.terminalNameRow}>
                        <Text style={styles.terminalName}>{template.name}</Text>
                        <Text style={[styles.modePill, styles.modePillShell]}>{template.strategy.toUpperCase()}</Text>
                      </View>
                      <Text style={styles.serverSubtitle}>{summarizeTemplate(template)}</Text>
                      <Text style={styles.emptyText}>{template.description || template.objective}</Text>
                      <View style={styles.actionsWrap}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Launch ${template.name} as approval plan`}
                          style={[styles.actionButton, busy ? styles.buttonDisabled : null]}
                          disabled={busy}
                          onPress={() => onLaunchTemplate(template, "plan")}
                        >
                          <Text style={styles.actionButtonText}>{busy ? "Launching..." : "Launch Plan"}</Text>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Launch ${template.name} as workflow`}
                          style={[
                            styles.actionButton,
                            busy || !capabilities.workflows ? styles.buttonDisabled : null,
                          ]}
                          disabled={busy || !capabilities.workflows}
                          onPress={() => onLaunchTemplate(template, "workflow")}
                        >
                          <Text style={styles.actionButtonText}>
                            {busy ? "Launching..." : capabilities.workflows ? "Start Workflow" : "Workflow Unavailable"}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          )}

          {!capabilities.templateGallery ? (
            <View style={styles.panel}>
              <Text style={styles.panelLabel}>Template Gallery</Text>
              <Text style={styles.emptyText}>This bridge does not expose gallery import routes yet.</Text>
            </View>
          ) : (
            <View style={styles.panel}>
              <Text style={styles.panelLabel}>Template Gallery</Text>
              {galleryTemplates.length === 0 ? (
                <Text style={styles.emptyText}>No built-in templates exposed by this runtime.</Text>
              ) : (
                galleryTemplates.slice(0, 4).map((template) => {
                  const busy = templateMutationKey === `${template.templateId}:gallery`;
                  return (
                    <View key={`bridge-gallery-${template.templateId}`} style={styles.terminalCard}>
                      <View style={styles.terminalNameRow}>
                        <Text style={styles.terminalName}>{template.name}</Text>
                        <Text style={[styles.modePill, styles.modePillAi]}>{template.source.toUpperCase()}</Text>
                      </View>
                      <Text style={styles.serverSubtitle}>{summarizeTemplate(template)}</Text>
                      <Text style={styles.emptyText}>{template.description || template.objective}</Text>
                      <View style={styles.actionsWrap}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Import and launch ${template.name} as approval plan`}
                          style={[styles.actionButton, busy ? styles.buttonDisabled : null]}
                          disabled={busy}
                          onPress={() => onLaunchTemplate(template, "plan")}
                        >
                          <Text style={styles.actionButtonText}>{busy ? "Importing..." : "Import + Plan"}</Text>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Import and launch ${template.name} as workflow`}
                          style={[
                            styles.actionButton,
                            busy || !capabilities.workflows ? styles.buttonDisabled : null,
                          ]}
                          disabled={busy || !capabilities.workflows}
                          onPress={() => onLaunchTemplate(template, "workflow")}
                        >
                          <Text style={styles.actionButtonText}>
                            {busy ? "Importing..." : capabilities.workflows ? "Import + Workflow" : "Workflow Unavailable"}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          )}
        </>
      )}
    </View>
  );
}

export function NovaAgentPanel({
  server,
  serverId,
  serverName,
  sessions,
  isPro,
  onShowPaywall,
  onQueueCommand,
  onOpenAgents,
  autoEnableLocalFallback = false,
  onAutoEnableLocalFallbackHandled,
  surface = "preview",
}: NovaAgentPanelProps) {
  const [newAgentName, setNewAgentName] = useState<string>("");
  const [newAgentCapabilities, setNewAgentCapabilities] = useState<string>("watch,tool-calling");
  const [remoteCreateStatus, setRemoteCreateStatus] = useState<string>("");
  const [localFallbackEnabled, setLocalFallbackEnabled] = useState<boolean>(surface === "preview");

  const defaultSession = useMemo(() => sessions[0] || null, [sessions]);
  const {
    loading: bridgeLoading,
    refreshing: bridgeRefreshing,
    supported: bridgeSupported,
    runtimeAvailable: bridgeRuntimeAvailable,
    capabilities: bridgeCapabilities,
    error: bridgeError,
    health: bridgeHealth,
    memoryStatus: bridgeMemoryStatus,
    browserStatus,
    voiceStatus,
    canvasStatus,
    mobileStatus,
    homeAssistantStatus,
    mqttStatus,
    controlArtifacts,
    loadControlArtifact,
    governance,
    plans: bridgePlans,
    jobs: bridgeJobs,
    workflows: bridgeWorkflows,
    templates: bridgeTemplates,
    galleryTemplates: bridgeGalleryTemplates,
    refresh: refreshBridge,
    createPlan,
    startWorkflow,
    importTemplate,
    launchTemplate,
    resumeWorkflow,
    approvePlanAsync,
    rejectPlan,
    retryFailedPlanAsync,
    undoPlan,
    pauseRuntime,
    resumeRuntime,
    resetGovernanceUsage,
    cancelAllJobs,
  } = useNovaAdaptBridge({ server, enabled: Boolean(serverId) });
  const [remoteMutationPlanId, setRemoteMutationPlanId] = useState<string | null>(null);
  const [remoteMutationWorkflowId, setRemoteMutationWorkflowId] = useState<string | null>(null);
  const [templateMutationKey, setTemplateMutationKey] = useState<string | null>(null);
  const [governanceBusy, setGovernanceBusy] = useState<boolean>(false);
  const showLocalPreview =
    surface === "preview" || (surface === "screen" && (!bridgeSupported || !bridgeRuntimeAvailable) && localFallbackEnabled);
  const showRemoteCreateControls = surface === "screen" && bridgeSupported && bridgeRuntimeAvailable;
  const runtimeUnavailable = !bridgeSupported || !bridgeRuntimeAvailable;

  useEffect(() => {
    if (!autoEnableLocalFallback || surface !== "screen") {
      return;
    }
    if (runtimeUnavailable) {
      setLocalFallbackEnabled(true);
    }
    onAutoEnableLocalFallbackHandled?.();
  }, [autoEnableLocalFallback, onAutoEnableLocalFallbackHandled, runtimeUnavailable, surface]);

  const runRemotePlanAction = useCallback(
    async (planId: string, action: (targetPlanId: string) => Promise<boolean>) => {
      setRemoteMutationPlanId(planId);
      try {
        await action(planId);
      } finally {
        setRemoteMutationPlanId((current) => (current === planId ? null : current));
      }
    },
    []
  );

  const runRemoteWorkflowAction = useCallback(
    async (workflowId: string, action: (targetWorkflowId: string) => Promise<boolean>) => {
      setRemoteMutationWorkflowId(workflowId);
      try {
        await action(workflowId);
      } finally {
        setRemoteMutationWorkflowId((current) => (current === workflowId ? null : current));
      }
    },
    []
  );

  const runGovernanceAction = useCallback(async (action: () => Promise<boolean>) => {
    setGovernanceBusy(true);
    try {
      await action();
    } finally {
      setGovernanceBusy(false);
    }
  }, []);

  const createRemotePlan = useCallback(async () => {
    const objective = newAgentName.trim();
    if (!objective) {
      return;
    }
    setRemoteCreateStatus("Creating approval plan...");
    try {
      const created = await createPlan(objective, { strategy: "single" });
      if (created) {
        setRemoteCreateStatus(`Created plan ${created.id}`);
        setNewAgentName("");
      } else {
        setRemoteCreateStatus("Plan creation returned no result.");
      }
    } catch (nextError) {
      const detail = nextError instanceof Error ? nextError.message : String(nextError || "Unknown error");
      setRemoteCreateStatus(`Plan creation failed: ${detail}`);
    }
  }, [createPlan, newAgentName]);

  const startRemoteWorkflow = useCallback(async () => {
    const objective = newAgentName.trim();
    if (!objective || !bridgeCapabilities.workflows) {
      return;
    }
    const capabilities = parseCapabilities(newAgentCapabilities);
    setRemoteCreateStatus("Starting server workflow...");
    try {
      const created = await startWorkflow(objective, {
        autoResume: true,
        metadata: capabilities.length > 0 ? { capabilities } : {},
      });
      if (created) {
        setRemoteCreateStatus(`Started workflow ${created.workflowId}`);
        setNewAgentName("");
      } else {
        setRemoteCreateStatus("Workflow creation returned no result.");
      }
    } catch (nextError) {
      const detail = nextError instanceof Error ? nextError.message : String(nextError || "Unknown error");
      setRemoteCreateStatus(`Workflow start failed: ${detail}`);
    }
  }, [bridgeCapabilities.workflows, newAgentCapabilities, newAgentName, startWorkflow]);

  const runTemplateLaunch = useCallback(
    async (template: NovaAdaptBridgeTemplate, mode: "plan" | "workflow") => {
      const savedTemplate = bridgeTemplates.find((item) => item.templateId === template.templateId) || null;
      const mutationScope = savedTemplate ? "saved" : "gallery";
      const mutationKey = `${template.templateId}:${mutationScope}`;
      setTemplateMutationKey(mutationKey);
      setRemoteCreateStatus(
        savedTemplate
          ? `Launching template ${template.name}...`
          : `Importing template ${template.name}...`
      );
      try {
        let launchTemplateId = template.templateId;
        if (!savedTemplate) {
          const imported = await importTemplate(template);
          if (!imported) {
            setRemoteCreateStatus(`Template import failed for ${template.name}.`);
            return;
          }
          launchTemplateId = imported.templateId;
        }
        const launched = await launchTemplate(launchTemplateId, { mode });
        if (launched) {
          setRemoteCreateStatus(
            mode === "workflow"
              ? `Started workflow from template ${template.name}`
              : `Created approval plan from template ${template.name}`
          );
        } else {
          setRemoteCreateStatus(`Template launch returned no result for ${template.name}.`);
        }
      } catch (nextError) {
        const detail = nextError instanceof Error ? nextError.message : String(nextError || "Unknown error");
        setRemoteCreateStatus(`Template launch failed: ${detail}`);
      } finally {
        setTemplateMutationKey((current) => (current === mutationKey ? null : current));
      }
    },
    [bridgeTemplates, importTemplate, launchTemplate]
  );

  if (!serverId) {
    return (
      <View style={styles.panel}>
        <Text style={styles.panelLabel}>{surface === "screen" ? "NovaAdapt Agents" : "NovaAdapt Agents (Preview)"}</Text>
        <Text style={styles.emptyText}>Select a server to manage agents.</Text>
      </View>
    );
  }

  return (
    <View style={styles.panel}>
      <Text style={styles.panelLabel}>{surface === "screen" ? "NovaAdapt Agents" : "NovaAdapt Agents (Preview)"}</Text>
      <Text style={styles.serverSubtitle}>
        {surface === "screen"
          ? `${serverName || "Server"} • Live runtime, plans, jobs, and workflows`
          : surface === "panel"
            ? `${serverName || "Server"} • Runtime status, plans, and workflows`
            : `${serverName || "Server"} • Agent lifecycle + approval queue groundwork`}
      </Text>

      <RemoteBridgeSection
        loading={bridgeLoading}
        refreshing={bridgeRefreshing}
        supported={bridgeSupported}
        runtimeAvailable={bridgeRuntimeAvailable}
        capabilities={bridgeCapabilities}
        error={bridgeError}
        health={bridgeHealth}
        memoryStatus={bridgeMemoryStatus}
        browserStatus={browserStatus}
        voiceStatus={voiceStatus}
        canvasStatus={canvasStatus}
        mobileStatus={mobileStatus}
        homeAssistantStatus={homeAssistantStatus}
        mqttStatus={mqttStatus}
        controlArtifacts={controlArtifacts}
        governance={governance}
        plans={bridgePlans}
        jobs={bridgeJobs}
        workflows={bridgeWorkflows}
        templates={bridgeTemplates}
        galleryTemplates={bridgeGalleryTemplates}
        templateMutationKey={templateMutationKey}
        mutationPlanId={remoteMutationPlanId}
        mutationWorkflowId={remoteMutationWorkflowId}
        governanceBusy={governanceBusy}
        serverBaseUrl={server?.baseUrl ?? null}
        serverToken={server?.token ?? null}
        onRefresh={() => {
          void refreshBridge({ quiet: true });
        }}
        onApprovePlan={(planId) => {
          void runRemotePlanAction(planId, approvePlanAsync);
        }}
        onRejectPlan={(planId) => {
          void runRemotePlanAction(planId, (targetPlanId) =>
            rejectPlan(targetPlanId, "Rejected from NovaRemote mobile panel")
          );
        }}
        onRetryPlan={(planId) => {
          void runRemotePlanAction(planId, retryFailedPlanAsync);
        }}
        onUndoPlan={(planId) => {
          void runRemotePlanAction(planId, undoPlan);
        }}
        onResumeWorkflow={(workflowId) => {
          void runRemoteWorkflowAction(workflowId, resumeWorkflow);
        }}
        onPauseRuntime={() => {
          void runGovernanceAction(() => pauseRuntime("Paused from NovaRemote mobile panel"));
        }}
        onResumeRuntime={() => {
          void runGovernanceAction(resumeRuntime);
        }}
        onResetGovernanceUsage={() => {
          void runGovernanceAction(resetGovernanceUsage);
        }}
        onCancelAllJobs={() => {
          void runGovernanceAction(() => cancelAllJobs("Canceled from NovaRemote mobile panel"));
        }}
        onLaunchTemplate={(template, mode) => {
          void runTemplateLaunch(template, mode);
        }}
        onLoadControlArtifact={loadControlArtifact}
      />

      {showRemoteCreateControls ? (
        <View style={styles.panel}>
          <Text style={styles.panelLabel}>Create on Server</Text>
          <Text style={styles.serverSubtitle}>Start a persistent workflow or queue an approval plan directly on NovaAdapt.</Text>
          <TextInput
            style={styles.input}
            value={newAgentName}
            onChangeText={setNewAgentName}
            placeholder="Objective (example: Watch cluster load and notify me)"
            placeholderTextColor="#7f7aa8"
          />
          <TextInput
            style={styles.input}
            value={newAgentCapabilities}
            onChangeText={setNewAgentCapabilities}
            placeholder="Metadata tags (comma separated)"
            placeholderTextColor="#7f7aa8"
            autoCapitalize="none"
          />
          <View style={styles.actionsWrap}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Create server approval plan"
              style={[styles.buttonPrimary, !newAgentName.trim() ? styles.buttonDisabled : null]}
              disabled={!newAgentName.trim()}
              onPress={() => {
                void createRemotePlan();
              }}
            >
              <Text style={styles.buttonPrimaryText}>Create Approval Plan</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Start server workflow"
              style={[
                styles.actionButton,
                !newAgentName.trim() || !bridgeCapabilities.workflows ? styles.buttonDisabled : null,
              ]}
              disabled={!newAgentName.trim() || !bridgeCapabilities.workflows}
              onPress={() => {
                void startRemoteWorkflow();
              }}
            >
              <Text style={styles.actionButtonText}>
                {bridgeCapabilities.workflows ? "Start Workflow" : "Workflow Unavailable"}
              </Text>
            </Pressable>
          </View>
          {!bridgeCapabilities.workflows ? (
            <Text style={styles.emptyText}>This companion runtime does not expose workflow creation yet.</Text>
          ) : null}
          {remoteCreateStatus ? <Text style={styles.emptyText}>{remoteCreateStatus}</Text> : null}
        </View>
      ) : null}

      {surface === "screen" && runtimeUnavailable ? (
        <View style={styles.panel}>
          <Text style={styles.panelLabel}>Server Runtime Unavailable</Text>
          <Text style={styles.serverSubtitle}>
            The server-backed NovaAdapt runtime is not available right now. Enable device fallback only if you need temporary agent controls on this phone.
          </Text>
          <Text style={styles.emptyText}>{summarizeCapabilities(bridgeCapabilities)}</Text>
          <View style={styles.actionsWrap}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={localFallbackEnabled ? "Hide device fallback controls" : "Enable device fallback controls"}
              style={[styles.actionButton, localFallbackEnabled ? styles.chipActive : null]}
              onPress={() => setLocalFallbackEnabled((current) => !current)}
            >
              <Text style={styles.actionButtonText}>{localFallbackEnabled ? "Hide Device Fallback" : "Enable Device Fallback"}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {surface === "panel" && (!bridgeSupported || !bridgeRuntimeAvailable) && typeof onOpenAgents === "function" ? (
        <View style={styles.panel}>
          <Text style={styles.panelLabel}>Need Local Controls?</Text>
          <Text style={styles.serverSubtitle}>
            Open the dedicated Agents screen to use the remaining local fallback tools while this server runtime is unavailable.
          </Text>
          <View style={styles.actionsWrap}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open Agents screen"
              style={styles.buttonPrimary}
              onPress={onOpenAgents}
            >
              <Text style={styles.buttonPrimaryText}>Open Agents</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {showLocalPreview ? (
        <View style={styles.panel}>
          <Text style={styles.panelLabel}>{surface === "screen" ? "Device Fallback Controls" : "Preview Runtime Controls"}</Text>
          <NovaDeviceFallbackPanel
            serverId={serverId}
            sessions={sessions}
            isPro={isPro}
            surface={surface}
            newAgentName={newAgentName}
            newAgentCapabilities={newAgentCapabilities}
            defaultSession={defaultSession}
            onShowPaywall={onShowPaywall}
            onQueueCommand={onQueueCommand}
            onNewAgentNameChange={setNewAgentName}
            onNewAgentCapabilitiesChange={setNewAgentCapabilities}
            onAgentCreated={() => {
              setNewAgentName("");
            }}
          />
        </View>
      ) : null}
    </View>
  );
}
