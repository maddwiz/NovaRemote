import { describe, expect, it } from "vitest";

import { parseQrPayload } from "./useQrSetup";

describe("parseQrPayload", () => {
  it("parses novaremote deep links including token", () => {
    const payload = parseQrPayload(
      "novaremote://add-server?name=MyServer&url=http%3A%2F%2F192.168.1.12%3A8787&token=abc123&cwd=%2Fsrv&backend=tmux"
    );

    expect(payload).not.toBeNull();
    expect(payload?.name).toBe("MyServer");
    expect(payload?.url).toBe("http://192.168.1.12:8787");
    expect(payload?.token).toBe("abc123");
    expect(payload?.cwd).toBe("/srv");
    expect(payload?.backend).toBe("tmux");
  });

  it("parses JSON payloads and rejects unsafe URL schemes", () => {
    const parsed = parseQrPayload('{"name":"Lab","url":"https://example.com:8787","token":"t","sshHost":"host"}');
    expect(parsed?.url).toBe("https://example.com:8787");
    expect(parsed?.token).toBe("t");
    expect(parsed?.sshHost).toBe("host");

    const unsafe = parseQrPayload('{"url":"javascript:alert(1)","token":"x"}');
    expect(unsafe).toBeNull();
  });

  it("returns null for unsupported QR payloads", () => {
    expect(parseQrPayload("https://example.com/whatever")).toBeNull();
    expect(parseQrPayload("random text")).toBeNull();
    expect(parseQrPayload("")).toBeNull();
  });
});
