const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const localDirPattern = /[/\\]\.local[/\\]/;

const defaultBlockList = config.resolver.blockList;
if (Array.isArray(defaultBlockList)) {
  config.resolver.blockList = [...defaultBlockList, localDirPattern];
} else if (defaultBlockList instanceof RegExp) {
  config.resolver.blockList = [defaultBlockList, localDirPattern];
} else {
  config.resolver.blockList = [localDirPattern];
}

module.exports = config;
