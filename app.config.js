const { createMobileAppConfig } = require("./app.config.shared");

function getRootVariant() {
  return process.env.APP_VARIANT === "client" ? "client" : "driver";
}

module.exports = () => createMobileAppConfig({
  variant: getRootVariant(),
  assetPrefix: ".",
});