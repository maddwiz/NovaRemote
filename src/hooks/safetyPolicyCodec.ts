export function decodeRequireDangerConfirm(raw: string | null): boolean {
  return raw !== "0";
}

export function encodeRequireDangerConfirm(value: boolean): "1" | "0" {
  return value ? "1" : "0";
}
