import { NovaAgent } from "./types";

function normalizeAgentName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string): string[] {
  return normalizeAgentName(value).split(" ").filter(Boolean);
}

export function hasExactAgentName(agents: NovaAgent[], name: string): boolean {
  const query = normalizeAgentName(name);
  if (!query) {
    return false;
  }
  return agents.some((agent) => normalizeAgentName(agent.name) === query);
}

export function findAgentIdsByName(agents: NovaAgent[], queryName: string): string[] {
  const query = normalizeAgentName(queryName);
  if (!query) {
    return [];
  }

  const exactMatches = agents.filter((agent) => normalizeAgentName(agent.name) === query);
  if (exactMatches.length > 0) {
    return exactMatches.map((agent) => agent.agentId);
  }

  const queryTokens = tokenize(queryName);
  if (queryTokens.length > 0) {
    const tokenMatches = agents.filter((agent) => {
      const target = normalizeAgentName(agent.name);
      return queryTokens.every((token) => target.includes(token));
    });
    if (tokenMatches.length > 0) {
      return tokenMatches.map((agent) => agent.agentId);
    }
  }

  const includesMatches = agents.filter((agent) => normalizeAgentName(agent.name).includes(query));
  if (includesMatches.length > 0) {
    return includesMatches.map((agent) => agent.agentId);
  }

  return [];
}

export const agentMatchingTestUtils = {
  normalizeAgentName,
  tokenize,
};
