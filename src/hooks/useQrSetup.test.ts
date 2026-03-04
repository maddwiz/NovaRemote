import { describe, expect, it } from "vitest";

import { parseQrPayload } from "./useQrSetup";

describe("parseQrPayload", () => {
  it("parses novaremote deep links including token", () => {
    const payload = parseQrPayload(
      "novaremote://add-server?name=MyServer&url=http%3A%2F%2F192.168.1.12%3A8787&token=abc123&cwd=%2Fsrv&backend=tmux&vm_host=homelab-r740&vm_type=proxmox&vm_name=build-runner-01&vm_id=101"
    );

    expect(payload).not.toBeNull();
    expect(payload?.name).toBe("MyServer");
    expect(payload?.url).toBe("http://192.168.1.12:8787");
    expect(payload?.token).toBe("abc123");
    expect(payload?.cwd).toBe("/srv");
    expect(payload?.backend).toBe("tmux");
    expect(payload?.vmHost).toBe("homelab-r740");
    expect(payload?.vmType).toBe("proxmox");
    expect(payload?.vmName).toBe("build-runner-01");
    expect(payload?.vmId).toBe("101");
  });

  it("parses JSON payloads and rejects unsafe URL schemes", () => {
    const parsed = parseQrPayload(
      '{"name":"Lab","url":"https://example.com:8787","token":"t","vmHost":"cluster-a","vmType":"qemu","vmName":"lab-vm","vmId":"202","sshHost":"host"}'
    );
    expect(parsed?.url).toBe("https://example.com:8787");
    expect(parsed?.token).toBe("t");
    expect(parsed?.vmHost).toBe("cluster-a");
    expect(parsed?.vmType).toBe("qemu");
    expect(parsed?.vmName).toBe("lab-vm");
    expect(parsed?.vmId).toBe("202");
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
