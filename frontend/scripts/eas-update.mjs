/**
 * Publish a patch update (EAS Update) to one channel, then upload its source maps to Sentry.
 *
 *   npm run update:preview -- "Fix the frame counter"
 *   npm run update:prod -- "Fix the frame counter"
 *
 * `eas update` bundles with this computer's environment, not the build profile's env in
 * eas.json, so the values that must match the store build are pinned here: an update can never
 * ship pointing at local data or a test server. Other EXPO_PUBLIC_* values (Sentry DSN, Google
 * client id) come from .env exactly as they do for builds.
 */
import { spawnSync } from 'node:child_process';

const channel = process.argv[2];
// Characters a Windows shell would treat as syntax are dropped from the message.
const message = process.argv
  .slice(3)
  .join(' ')
  .replace(/["%^&|<>]/g, '')
  .trim();
const onWindows = process.platform === 'win32';
if (!['preview', 'production'].includes(channel) || !message) {
  console.error('Usage: node scripts/eas-update.mjs <preview|production> "<what changed>"');
  process.exit(2);
}

const env = {
  ...process.env,
  EXPO_PUBLIC_USE_LOCAL_DATA: 'false',
  EXPO_PUBLIC_API_URL: 'https://snookit.duckdns.org',
};

function run(command, args) {
  // npx is a .cmd file on Windows, which Node only starts through a shell.
  const result = spawnSync(command, args, { stdio: 'inherit', env, shell: onWindows });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run('npx', [
  'eas',
  'update',
  '--channel',
  channel,
  '--message',
  onWindows ? `"${message}"` : message,
]);
if (process.env.SENTRY_AUTH_TOKEN) {
  run('npx', ['sentry-expo-upload-sourcemaps', 'dist']);
} else {
  console.warn('SENTRY_AUTH_TOKEN is not set: source maps were not uploaded to Sentry.');
}
