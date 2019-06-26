const chalk = require('chalk');
const store = require('./services/store');

function getFullUpstreamNameLogs(proxyConfig, upstreamConfig) {
  if (proxyConfig.hideUpstreamName) {
    if (!store.getUseColors()) {
      return proxyConfig.name;
    }

    return getName(proxyConfig);
  }

  if (!store.getUseColors()) {
    return `${proxyConfig.name} | ${upstreamConfig.name}`;
  }

  return `${getName(proxyConfig)} | ${getName(upstreamConfig)}`;
}

function getName(config) {
  if (!store.getUseColors()) {
    return config.name;
  }

  return `${config.color ? chalk.hex(config.color)(config.name) : config.name}`;
}

function getString(text, color) {
  if (!store.getUseColors() || !color) {
    return text;
  }
  if (!color.startsWith('#')) {
    return chalk[color](text);
  }

  return chalk.hex(color)(text);
}

function getAccountColor(accountId, upstream) {
  if (upstream.accountColors[accountId]) {
    return upstream.accountColors[accountId];
  }

  return upstream.accountColor;
}

module.exports = {
  getFullUpstreamNameLogs,
  getName,
  getString,
  getAccountColor,
};