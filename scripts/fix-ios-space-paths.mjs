#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function patchFile(filePath, transform) {
  if (!fs.existsSync(filePath)) {
    return { filePath, changed: false, skipped: true };
  }

  const original = fs.readFileSync(filePath, "utf8");
  const next = transform(original);

  if (next === original) {
    return { filePath, changed: false, skipped: false };
  }

  fs.writeFileSync(filePath, next, "utf8");
  return { filePath, changed: true, skipped: false };
}

function patchPodfileProperties(filePath) {
  if (!fs.existsSync(filePath)) {
    return { filePath, changed: false, skipped: true };
  }

  const raw = fs.readFileSync(filePath, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { filePath, changed: false, skipped: false };
  }

  if (parsed["ios.buildReactNativeFromSource"] === "true") {
    return { filePath, changed: false, skipped: false };
  }

  parsed["ios.buildReactNativeFromSource"] = "true";
  fs.writeFileSync(filePath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  return { filePath, changed: true, skipped: false };
}

function ensureExpoModuleSymlinks(rootDir) {
  const expoModulesRoot = path.join(rootDir, "node_modules", "expo", "node_modules");
  const topLevelModulesRoot = path.join(rootDir, "node_modules");

  if (!fs.existsSync(expoModulesRoot) || !fs.existsSync(topLevelModulesRoot)) {
    return [];
  }

  const linked = [];
  for (const entry of fs.readdirSync(topLevelModulesRoot)) {
    if (!entry.startsWith("expo-")) {
      continue;
    }

    const topLevelModulePath = path.join(topLevelModulesRoot, entry);
    if (!fs.statSync(topLevelModulePath).isDirectory()) {
      continue;
    }

    const nestedModulePath = path.join(expoModulesRoot, entry);
    if (fs.existsSync(nestedModulePath)) {
      continue;
    }

    const relativeTarget = path.relative(expoModulesRoot, topLevelModulePath);
    fs.symlinkSync(relativeTarget, nestedModulePath, "dir");
    linked.push(path.relative(rootDir, nestedModulePath));
  }

  return linked;
}

const root = process.cwd();
const podfileProps = path.join(root, "ios", "Podfile.properties.json");
const appPbxproj = path.join(root, "ios", "NovaRemote.xcodeproj", "project.pbxproj");
const podsPbxproj = path.join(root, "ios", "Pods", "Pods.xcodeproj", "project.pbxproj");

const appOld = "`\\\"$NODE_BINARY\\\" --print \\\"require('path').dirname(require.resolve('react-native/package.json')) + '/scripts/react-native-xcode.sh'\\\"`";
const appNew = "RN_XCODE_SCRIPT=\\\"$(\\\"$NODE_BINARY\\\" --print \\\"require('path').dirname(require.resolve('react-native/package.json')) + '/scripts/react-native-xcode.sh'\\\")\\\"\\n\\\"$RN_XCODE_SCRIPT\\\"";

const podsOld = "shellScript = \"bash -l -c \\\"$PODS_TARGET_SRCROOT/../scripts/get-app-config-ios.sh\\\"\";";
const podsNew =
  "shellScript = \"script_path=\\\"${PODS_TARGET_SRCROOT}/../scripts/get-app-config-ios.sh\\\"\\nbash -l -c \\\"\\\\\\\"${script_path}\\\\\\\"\\\"\\n\";";

const appResult = patchFile(appPbxproj, (text) => {
  if (text.includes(appNew)) {
    return text;
  }
  if (!text.includes(appOld)) {
    return text;
  }
  return text.replace(appOld, appNew);
});

const podsResult = patchFile(podsPbxproj, (text) => {
  if (text.includes(podsNew)) {
    return text;
  }
  if (!text.includes(podsOld)) {
    return text;
  }
  return text.replace(podsOld, podsNew);
});

const podfilePropsResult = patchPodfileProperties(podfileProps);
const expoSymlinks = ensureExpoModuleSymlinks(root);
const results = [podfilePropsResult, appResult, podsResult];
for (const result of results) {
  const rel = path.relative(root, result.filePath);
  if (result.skipped) {
    console.log(`skipped: ${rel} (missing)`);
  } else if (result.changed) {
    console.log(`patched: ${rel}`);
  } else {
    console.log(`ok: ${rel}`);
  }
}

for (const rel of expoSymlinks) {
  console.log(`linked: ${rel}`);
}
