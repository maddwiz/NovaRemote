function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function summarizeStatusText(value: string, maxLength: number = 42): string {
  const compact = compactWhitespace(value);
  if (!compact) {
    return "Ready";
  }

  const lower = compact.toLowerCase();

  if (lower.startsWith("nova voice retrying")) {
    if (lower.includes("no speech was detected")) {
      return "Voice retrying: no speech";
    }
    if (lower.includes("network request failed")) {
      return "Voice retrying: network";
    }
    if (lower.includes("native fallback failed")) {
      return "Voice retrying: fallback";
    }
    return "Voice retrying";
  }

  if (lower.startsWith("nova voice error")) {
    if (lower.includes("no speech was detected")) {
      return "Voice error: no speech";
    }
    if (lower.includes("network request failed")) {
      return "Voice error: network";
    }
    return "Voice error";
  }

  if (compact.length <= maxLength) {
    return compact;
  }

  const firstSentence = compact.split(/(?<=[.!?])\s+/)[0]?.trim();
  if (firstSentence && firstSentence.length <= maxLength) {
    return firstSentence;
  }

  const firstClause = compact.split(/[:;,.]/)[0]?.trim();
  if (firstClause && firstClause.length <= maxLength) {
    return firstClause;
  }

  return `${compact.slice(0, Math.max(8, maxLength - 3)).trimEnd()}...`;
}
