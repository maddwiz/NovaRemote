export type AgentRuntimeFallbackResult = {
  route: "agents";
  focusedServerId: string;
  message: string;
};

type BuildAgentRuntimeFallbackArgs = {
  targetServerId: string;
  focusedServerId: string | null;
};

export function buildAgentRuntimeFallback({
  targetServerId,
  focusedServerId,
}: BuildAgentRuntimeFallbackArgs): AgentRuntimeFallbackResult {
  const trimmedTargetServerId = targetServerId.trim();
  if (!trimmedTargetServerId) {
    return {
      route: "agents",
      focusedServerId: focusedServerId ?? "",
      message: "Server runtime unavailable. Open the Agents screen to use the device fallback.",
    };
  }

  if (focusedServerId === trimmedTargetServerId) {
    return {
      route: "agents",
      focusedServerId: trimmedTargetServerId,
      message: "Server runtime unavailable. Open the Agents screen to use the device fallback for the focused server.",
    };
  }

  return {
    route: "agents",
    focusedServerId: trimmedTargetServerId,
    message: "Target server runtime unavailable. Open the Agents screen to use the device fallback for that server.",
  };
}
