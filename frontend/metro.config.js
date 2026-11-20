/**
 * Metro config: Expo's defaults plus Sentry's serializer, which gives every bundle and its
 * source map a matching debug id, so crash reports can be turned back into real code lines.
 */
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

module.exports = getSentryExpoConfig(__dirname);
