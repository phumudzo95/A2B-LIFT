const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const defaultBlockList = config.resolver.blockList || [];
const extraBlockList = [/[/\\]\.local[/\\].*/];

config.resolver.blockList = Array.isArray(defaultBlockList)
  ? [...defaultBlockList, ...extraBlockList]
  : extraBlockList;

module.exports = config;
