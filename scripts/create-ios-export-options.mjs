import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required to export an iOS release.`);
  return value;
};

const xml = (value) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;');

const teamId = required('IOS_TEAM_ID');
const profileName = required('IOS_PROVISIONING_PROFILE_NAME');
const output = resolve(required('IOS_EXPORT_OPTIONS_PATH'));
const bundleIdentifier = process.env.IOS_BUNDLE_IDENTIFIER?.trim() || 'com.renitizer.app';
const method = process.env.IOS_EXPORT_METHOD?.trim() || 'app-store';
const permittedMethods = new Set(['app-store', 'ad-hoc', 'development', 'enterprise', 'release-testing', 'debugging']);

if (!permittedMethods.has(method)) {
  throw new Error(`IOS_EXPORT_METHOD must be one of: ${[...permittedMethods].join(', ')}.`);
}

const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>${xml(method)}</string>
  <key>signingStyle</key>
  <string>manual</string>
  <key>teamID</key>
  <string>${xml(teamId)}</string>
  <key>provisioningProfiles</key>
  <dict>
    <key>${xml(bundleIdentifier)}</key>
    <string>${xml(profileName)}</string>
  </dict>
</dict>
</plist>
`;

await mkdir(dirname(output), { recursive: true });
await writeFile(output, plist, 'utf8');
