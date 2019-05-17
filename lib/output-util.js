const chalk = require('chalk');
const store = require('./services/store');

function getFullUpstreamNameLogs(proxyConfig, upstreamConfig) {
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

module.exports = {
  getFullUpstreamNameLogs,
  getName,
};