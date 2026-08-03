import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

function runNode(script, environment) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], { env: { ...process.env, ...environment } });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `Process exited with ${code}`));
    });
  });
}

test('declares repeatable Capacitor Android and iOS foundations', async () => {
  const packageJson = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const capacitorConfig = JSON.parse(await fs.readFile(new URL('../capacitor.config.json', import.meta.url), 'utf8'));

  assert.equal(packageJson.scripts['build:native-web'], 'node scripts/build-native-web.mjs');
  assert.equal(typeof packageJson.scripts['native:sync'], 'string');
  assert.equal(typeof packageJson.scripts['native:android'], 'string');
  assert.equal(typeof packageJson.scripts['native:ios'], 'string');
  assert.equal(typeof packageJson.devDependencies['@capacitor/cli'], 'string');
  assert.equal(typeof packageJson.dependencies['@capacitor/core'], 'string');
  assert.equal(typeof packageJson.dependencies['@capacitor/android'], 'string');
  assert.equal(typeof packageJson.dependencies['@capacitor/ios'], 'string');
  assert.equal(capacitorConfig.webDir, 'native-web');
  await fs.access(new URL('../scripts/build-native-web.mjs', import.meta.url));
  await fs.access(new URL('../android/capacitor.settings.gradle', import.meta.url));
  await fs.access(new URL('../ios/App/App.xcodeproj', import.meta.url));
});

test('includes a Tauri desktop project foundation', async () => {
  const packageJson = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const tauriConfig = JSON.parse(await fs.readFile(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'));

  assert.equal(typeof packageJson.scripts['desktop:build'], 'string');
  assert.equal(typeof packageJson.devDependencies['@tauri-apps/cli'], 'string');
  await fs.access(new URL('../src-tauri/Cargo.toml', import.meta.url));
  await fs.access(new URL('../src-tauri/src/main.rs', import.meta.url));
  await fs.access(new URL('../src-tauri/tauri.conf.json', import.meta.url));
  await fs.access(new URL('../src-tauri/sign-windows.ps1', import.meta.url));
  await fs.access(new URL('../src-tauri/icons/icon.ico', import.meta.url));
  assert.match(tauriConfig.bundle.windows.signCommand, /sign-windows\.ps1/);
});

test('declares an approval-gated native release pipeline with real signing inputs', async () => {
  const workflow = await fs.readFile(new URL('../.github/workflows/native-release.yml', import.meta.url), 'utf8');
  const androidBuild = await fs.readFile(new URL('../android/app/build.gradle', import.meta.url), 'utf8');

  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /environment:\s*production/);
  assert.match(workflow, /ANDROID_KEYSTORE_BASE64/);
  assert.match(workflow, /APPLE_CERTIFICATE_BASE64/);
  assert.match(workflow, /APPLE_PROVISIONING_PROFILE_BASE64/);
  assert.match(workflow, /WINDOWS_CERTIFICATE_BASE64/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.doesNotMatch(workflow, /npm run native:sync/);
  assert.doesNotMatch(workflow, /IOS_EXPORT_OPTIONS_PATH:\s*\$\{\{\s*runner\.temp\s*\}\}/);
  assert.match(workflow, /export IOS_EXPORT_OPTIONS_PATH="\$RUNNER_TEMP\/renitizer-ios\/ExportOptions\.plist"/);
  assert.match(workflow, /gradlew bundleRelease/);
  assert.match(workflow, /xcodebuild\s+-project[\s\S]*?\sarchive/);
  assert.match(workflow, /tauri build/);
  assert.match(androidBuild, /RENITIZER_RELEASE_STORE_FILE/);
  assert.match(androidBuild, /signingConfigs/);
});

test('uses the compact Gradle wrapper distribution for repeatable Android builds', async () => {
  const wrapperProperties = await fs.readFile(new URL('../android/gradle/wrapper/gradle-wrapper.properties', import.meta.url), 'utf8');

  assert.match(wrapperProperties, /distributionUrl=.*gradle-8\.14\.3-bin\.zip/);
  assert.doesNotMatch(wrapperProperties, /gradle-8\.14\.3-all\.zip/);
});

test('verifies unsigned Android, iOS simulator, and desktop foundations in CI', async () => {
  const workflow = await fs.readFile(new URL('../.github/workflows/native-verify.yml', import.meta.url), 'utf8');

  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /chmod \+x gradlew/);
  assert.match(workflow, /gradlew assembleDebug/);
  assert.match(workflow, /xcodebuild -project App\.xcodeproj/);
  assert.doesNotMatch(workflow, /-workspace App\.xcworkspace/);
  assert.match(workflow, /CODE_SIGNING_ALLOWED=NO/);
  assert.match(workflow, /cargo check --manifest-path src-tauri\/Cargo\.toml/);
  assert.match(workflow, /windows-latest/);
  assert.match(workflow, /macos-latest/);
});

test('writes an iOS App Store export plist without embedding credentials', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'renitizer-ios-export-'));
  const output = path.join(directory, 'ExportOptions.plist');

  await runNode('scripts/create-ios-export-options.mjs', {
    IOS_TEAM_ID: 'ABCDE12345',
    IOS_PROVISIONING_PROFILE_NAME: 'Renitizer App Store',
    IOS_EXPORT_OPTIONS_PATH: output,
  });

  const plist = await fs.readFile(output, 'utf8');
  assert.match(plist, /<string>app-store<\/string>/);
  assert.match(plist, /<string>ABCDE12345<\/string>/);
  assert.match(plist, /<key>com\.renitizer\.app<\/key>/);
  assert.match(plist, /<string>Renitizer App Store<\/string>/);
  assert.doesNotMatch(plist, /PASSWORD|PRIVATE KEY|CERTIFICATE/);
});
