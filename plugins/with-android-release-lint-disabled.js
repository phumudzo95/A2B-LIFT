const { createRunOncePlugin, withAppBuildGradle } = require("@expo/config-plugins");

const withAndroidReleaseLintDisabled = (config) =>
  withAppBuildGradle(config, (config) => {
    if (config.modResults.language !== "groovy") {
      return config;
    }

    if (config.modResults.contents.includes("checkReleaseBuilds false")) {
      return config;
    }

    config.modResults.contents = config.modResults.contents.replace(
      /android\s*\{/,
      `android {
    lint {
        checkReleaseBuilds false
        abortOnError false
    }`
    );

    return config;
  });

module.exports = createRunOncePlugin(
  withAndroidReleaseLintDisabled,
  "with-android-release-lint-disabled",
  "1.0.0"
);