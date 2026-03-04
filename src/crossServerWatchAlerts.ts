import { applyWatchMatches, findWatchMatches, formatWatchAlertMessage } from "./watchAlerts";
import { ServerConnection, ServerProfile, WatchRule } from "./types";

type EvaluateCrossServerWatchAlertsArgs = {
  isPro: boolean;
  focusedServerId: string | null;
  servers: ServerProfile[];
  connections: Map<string, ServerConnection>;
  rulesByServer: Record<string, Record<string, WatchRule>>;
};

type CrossServerWatchNotification = {
  serverId: string;
  title: string;
  body: string;
};

type EvaluateCrossServerWatchAlertsResult = {
  nextRulesByServer: Record<string, Record<string, WatchRule>>;
  notifications: CrossServerWatchNotification[];
  changedServerIds: string[];
};

export function evaluateCrossServerWatchAlerts({
  isPro,
  focusedServerId,
  servers,
  connections,
  rulesByServer,
}: EvaluateCrossServerWatchAlertsArgs): EvaluateCrossServerWatchAlertsResult {
  const nextRulesByServer = { ...rulesByServer };
  const notifications: CrossServerWatchNotification[] = [];
  const changedServerIds: string[] = [];

  if (!isPro) {
    return {
      nextRulesByServer,
      notifications,
      changedServerIds,
    };
  }

  servers.forEach((server) => {
    if (server.id === focusedServerId) {
      return;
    }

    const connection = connections.get(server.id);
    if (!connection) {
      return;
    }

    const currentRules = rulesByServer[server.id];
    if (!currentRules) {
      return;
    }

    const matches = findWatchMatches(currentRules, connection.tails);
    if (matches.length === 0) {
      return;
    }

    const applied = applyWatchMatches(currentRules, matches);
    if (!applied.changed) {
      return;
    }

    nextRulesByServer[server.id] = applied.nextRules;
    changedServerIds.push(server.id);
    matches.forEach(({ session, match }) => {
      notifications.push({
        serverId: server.id,
        title: "Watch alert",
        body: formatWatchAlertMessage(session, match, server.name),
      });
    });
  });

  return {
    nextRulesByServer,
    notifications,
    changedServerIds,
  };
}
