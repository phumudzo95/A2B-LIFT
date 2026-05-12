const { createMobileAppConfig } = require("../../app.config.shared");

module.exports = () => createMobileAppConfig({
  variant: "client",
  assetPrefix: "../..",
});