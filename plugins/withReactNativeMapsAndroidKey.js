const { AndroidConfig, createRunOncePlugin } = require("@expo/config-plugins");

function withReactNativeMapsAndroidKey(config) {
  return AndroidConfig.GoogleMapsApiKey.withGoogleMapsApiKey(config);
}

module.exports = createRunOncePlugin(
  withReactNativeMapsAndroidKey,
  "with-react-native-maps-android-key",
  "1.0.0",
);