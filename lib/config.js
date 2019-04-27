const crypto = require('crypto');
const fs = require('fs');
const JSONbig = require('json-bigint');
const os = require('os');
const path = require('path');
const YAML = require('js-yaml');
const util = require('./util');
const store = require('./services/store');
const eventBus = require('./services/event-bus');

module.exports = class Config {
  static get defaultConfig() {
    return {
      proxies: [{
        name: 'Burst-BHD',
        maxScanTime: 35,
        upstreams: [{
          name: 'Burst Solo',
          url: 'http://localhost:8125',
          mode: 'solo',
          passphrase: 'asdf',
          targetDL: 86400,
          prio: 10,
        }, {
          name: 'HDPool',
          mode: 'pool',
          type: 'hdpool',
          accountKey: '1234',
          targetDL: 31536000,
          prio: 11,
        }],
      }],
      listenAddr: '127.0.0.1:12345',
      useMultiplePorts: false,
      webAuth: {
        username: 'admin',
        password: 'admin',
      },
      logLevel: 'info',
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
    this.migrateFromJSON();
    this.loadFromFile();
    this.migrateToProxyConfig();
    this.replacePassWithHash();
    if (this.logToFile) {
      util.ensureFilePathExists(path.join(this.logDir, 'proxy.log'));
    }
    this.validateConfig();
  }

  validateConfig() {
    const upstreamTypesWithAccountKey = [
      'hdpool',
      'hdpool-eco',
      'hpool',
    ];
    const validListenAddrExists = this.config.listenAddr && this.config.listenAddr.split(':').length === 2;
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
        Config.logErrorAndExit(`Proxy ${proxy.name} does not have any upstreams!`);
      }
      proxy.upstreams.forEach(upstream => {
        if (!upstream.name) {
          Config.logErrorAndExit(`Proxy ${proxy.name}: At least one upstream does not have a name!`);
        }
        if (!upstream.type && !upstream.url) {
          Config.logErrorAndExit(`Proxy ${proxy.name}: Upstream ${upstream.name}: No url defined!`);
        }
        if (!upstream.targetDL && !upstream.submitProbability) {
          Config.logErrorAndExit(`Proxy ${proxy.name}: Upstream ${upstream.name}: No targetDL or submitProbability defined!`);
        }
        if ((upstreamTypesWithAccountKey.indexOf(upstream.type) !== -1) && !upstream.accountKeyForAccountId && !upstream.accountKey) {
          Config.logErrorAndExit(`Proxy ${proxy.name}: Upstream ${upstream.name}: No accountKey defined!`);
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
      eventBus.publish('log/info', `First start detected, creating the config file (${this.filePath}), please adjust it to your preferences.\n` +
          'Config examples are available here: https://github.com/felixbrucker/bhd-burst-proxy/wiki/Config-examples');
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
    return this.config.listenAddr.split(':')[0];
  }

  get listenPort() {
    return parseInt(this.config.listenAddr.split(':')[1], 10);
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
    return this.config.logDir || path.join(os.homedir(), '.config/bhd-burst-proxy/logs');
  }

  get transport() {
    return this.config.transport || 'http';
  }
};
