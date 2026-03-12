#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const infoPlistPath = path.join(process.cwd(), "ios", "NovaRemote", "Info.plist");

const requiredEntries = [
  {
    key: "NSCameraUsageDescription",
    value: "NovaRemote uses the camera to scan QR codes for quick server setup.",
  },
  {
    key: "NSMicrophoneUsageDescription",
    value: "NovaRemote uses the microphone for voice commands and glasses mode hands-free control.",
  },
  {
    key: "NSSpeechRecognitionUsageDescription",
    value: "NovaRemote uses speech recognition to transcribe hands-free commands into Nova actions.",
  },
];

if (!fs.existsSync(infoPlistPath)) {
  console.log("[ensure-ios-info-plist] Info.plist not found, skipping.");
  process.exit(0);
}

let plist = fs.readFileSync(infoPlistPath, "utf8");
let changed = false;

for (const entry of requiredEntries) {
  const keyTag = `<key>${entry.key}</key>`;
  if (plist.includes(keyTag)) {
    continue;
  }
  const insertBlock = `\n    ${keyTag}\n    <string>${entry.value}</string>`;
  plist = plist.replace("\n  </dict>", `${insertBlock}\n  </dict>`);
  changed = true;
}

if (changed) {
  fs.writeFileSync(infoPlistPath, plist, "utf8");
  console.log("[ensure-ios-info-plist] Added missing iOS permission usage descriptions.");
} else {
  console.log("[ensure-ios-info-plist] Info.plist already includes required usage descriptions.");
}
