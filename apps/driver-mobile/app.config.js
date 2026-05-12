const { createMobileAppConfig } = require("../../app.config.shared");

module.exports = () => createMobileAppConfig({
  variant: "driver",
  assetPrefix: "../..",
});