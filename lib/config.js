const chalk = require('chalk');
const crypto = require('crypto');
const fs = require('fs');
const JSONbig = require('json-bigint');
const os = require('os');
const path = require('path');
const YAML = require('js-yaml');
const util = require('./util');
const store = require('./services/store');
const eventBus = require('./services/event-bus');
const outputUtil = require('./output-util');

module.exports = class Config {
  static get defaultConfig() {
    return {
      proxies: [{
        name: 'BURST-BHD',
        maxScanTime: 35,
        upstreams: [{
          name: 'FoxyPool BURST',
          type: 'foxypool',
          coin: 'BURST',
          payoutAddress: 'your BURST payout address',
          accountName: 'your desired name',
          minerName: 'your desired miner name',
          weight: 10,
          color: '#4959ff',
        }, {
          name: 'FoxyPool BHD',
          type: 'foxypool',
          coin: 'BHD',
          payoutAddress: 'your BHD payout address',
          accountName: 'your desired name',
          minerName: 'your desired miner name',
          weight: 11,
          color: '#f49d11',
        }],
      }],
      listenAddr: '127.0.0.1:12345',
      useMultiplePorts: false,
      webAuth: {
        username: 'admin',
        password: 'admin',
      },
      logLevel: 'info',
      logToFile: true,
      isInstalledGlobally: true,
    };
  }

  static logErrorAndExit(error) {
    eventBus.publish('log/error', `There is an error with your config file: ${error}`);
    process.exit(1);
  }

  constructor() {
    if (process.env.CONFIG) {
      this._config = JSONbig.parse(process.env.CONFIG);
      this.config.listenAddr = `0.0.0.0:${process.env.PORT}`;
      this.config.useMultiplePorts = false;
      this.validateConfig();
      return;
    }
    this.filePath = store.getConfigFilePath();
    util.ensureFilePathExists(this.filePath);
    util.ensureFilePathExists(store.getDbFilePath());
    this.migrateFromJSON();
    this.migrateFromLegacyLocation();
    this.loadFromFile();
    this.migrateToProxyConfig();
    this.replacePassWithHash();
    if (this.logToFile) {
      util.ensureFilePathExists(path.join(this.logDir, 'proxy.log'));
    }
    this.validateConfig();
  }

  validateConfig() {
    const upstreamTypesWithUrl = [
      'socketio',
    ];
    const upstreamTypesWithTargetDL = [
      'socketio',
    ];
    const validListenAddrExists = this.config.listenAddr && this.config.listenAddr.split(':').length >= 2;
    if (!validListenAddrExists) {
      Config.logErrorAndExit('No valid listenAddr specified!');
    }
    if (this.listenPort < 1 || this.listenPort > 65535) {
      Config.logErrorAndExit('No valid port specified!');
    }
    if (this.config.webAuth && (!this.config.webAuth.username || (!this.config.webAuth.password && !this.config.webAuth.passHash))) {
      Config.logErrorAndExit('No valid webAuth defined, username or password missing!');
    }
    if (!this.config.proxies || !Array.isArray(this.config.proxies) || this.config.proxies.length === 0) {
      Config.logErrorAndExit('No proxies configured!');
    }
    this.proxies.forEach(proxy => {
      if (!proxy.name) {
        Config.logErrorAndExit('At least one proxy does not have a name!');
      }
      if (!proxy.upstreams || !Array.isArray(proxy.upstreams) || proxy.upstreams.length === 0) {
        Config.logErrorAndExit(`Proxy ${outputUtil.getName(proxy)} does not have any upstreams!`);
      }
      proxy.upstreams.forEach(upstream => {
        if (!upstream.name) {
          Config.logErrorAndExit(`Proxy ${outputUtil.getName(proxy)}: At least one upstream does not have a name!`);
        }
        if ((!upstream.type || upstreamTypesWithUrl.indexOf(upstream.type) !== -1) && !upstream.url) {
          Config.logErrorAndExit(`Proxy ${outputUtil.getName(proxy)}, Upstream ${outputUtil.getName(upstream)}: No url defined!`);
        }
        if ((!upstream.type || upstreamTypesWithTargetDL.indexOf(upstream.type) !== -1) && !upstream.targetDL && !upstream.submitProbability) {
          Config.logErrorAndExit(`Proxy ${outputUtil.getName(proxy)}, Upstream ${outputUtil.getName(upstream)}: No targetDL or submitProbability defined!`);
        }
        if (upstream.type === 'foxypool' && (!upstream.payoutAddress && !upstream.accountKey)) {
          Config.logErrorAndExit(`Proxy ${outputUtil.getName(proxy)}, Upstream ${outputUtil.getName(upstream)}: No payoutAddress defined!`);
        }
        if (proxy.useProfitability && !upstream.coin) {
          Config.logErrorAndExit(`Proxy ${outputUtil.getName(proxy)}, Upstream ${outputUtil.getName(upstream)}: No coin defined!`);
        }
      });
    });
  }

  migrateFromJSON() {
    if (!fs.existsSync('config.json')) {
      return;
    }
    eventBus.publish('log/info', 'Old config file format detected, migrating to yaml ..');
    const oldConfig = JSONbig.parse(fs.readFileSync('config.json'));
    fs.writeFileSync(this.filePath, YAML.safeDump(oldConfig));
    fs.unlinkSync('config.json');
  }

  migrateFromLegacyLocation() {
    const legacyConfig = util.getLegacyFilePath('config.yaml');
    if (!fs.existsSync(legacyConfig)) {
      return;
    }
    eventBus.publish('log/info', `Old config file location detected, migrating to ${this.filePath} ..`);
    fs.writeFileSync(this.filePath, fs.readFileSync(legacyConfig));
    fs.unlinkSync(legacyConfig);
  }

  migrateToProxyConfig() {
    if (!this.config.upstreams) {
      return;
    }
    this.config.proxies = this.config.upstreams.map(upstreamConfig => ({
      name: upstreamConfig.name,
      upstreams: [upstreamConfig]
    }));
    delete this.config.upstreams;
    this.saveToFile();
  }

  replacePassWithHash() {
    if (!this.webAuth || !this.webAuth.password) {
      return;
    }
    this.webAuth.passHash = crypto.createHash('sha256').update(this.webAuth.password, 'utf8').digest('hex');
    delete this.webAuth.password;
    this.saveToFile();
  }

  loadFromFile() {
    let file;
    try {
      file = fs.readFileSync(this.filePath);
    } catch (err) {
      eventBus.publish('log/info', `First start detected, creating the config file (${chalk.cyan(this.filePath)}), please adjust it to your preferences.\n` +
          'Possible config options are available here: https://docs.foxypool.io/foxy-proxy/configuration/#configuration-options');
      this.initFromObject();
      this.saveToFile();
      process.exit(0);
    }
    let configObject = null;
    try {
      configObject = YAML.safeLoad(file);
    } catch (err) {
      Config.logErrorAndExit(err);
    }
    this.initFromObject(configObject);
  }

  saveToFile() {
    const yaml = YAML.safeDump(this.config, {
      lineWidth: 140,
    });
    fs.writeFileSync(this.filePath, yaml);
  }

  initFromObject(configObject = null) {
    this._config = configObject || Config.defaultConfig;
  }

  get useMultiplePorts() {
    return this.config.useMultiplePorts;
  }

  get proxies() {
    return this.config.proxies;
  }

  get listenAddr() {
    return this.config.listenAddr;
  }

  get listenHost() {
    const parts = this.config.listenAddr.split(':');
    parts.pop();
    return parts.join(':');
  }

  get listenPort() {
    const parts = this.config.listenAddr.split(':');
    return parseInt(parts.pop(), 10);
  }

  get config() {
    return this._config;
  }

  get webAuth() {
    return this.config.webAuth;
  }

  get logLevel() {
    return this.config.logLevel;
  }

  get logToFile() {
    return this.config.logToFile;
  }

  get logDir() {
    return this.config.logDir || path.join(os.homedir(), '.config/foxy-proxy/logs');
  }

  get logMaxFiles() {
    return this.config.logMaxFiles || null;
  }

  get transports() {
    return this.config.transports || ['http'];
  }

  get useEcoBlockRewardsForProfitability() {
    return !!this.config.useEcoBlockRewards;
  }

  get allowLongPolling() {
    return !!this.config.allowLongPolling;
  }
};
