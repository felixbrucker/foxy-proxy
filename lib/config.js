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

  constructor() {
    if (process.env.CONFIG) {
      this._config = JSONbig.parse(process.env.CONFIG);
      this.config.listenAddr = `0.0.0.0:${process.env.PORT}`;
      this.config.useMultiplePorts = false;
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
  }

  migrateFromJSON() {
    if (!fs.existsSync('config.json')) {
      return;
    }
    eventBus.publish('log/info', 'old config file format detected, migrating to yaml ..');
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
      eventBus.publish('log/info', `first start detected, creating the config file (${this.filePath}), please adjust it to your preferences`);
      this.initFromObject();
      this.saveToFile();
      process.exit(0);
    }
    let configObject = null;
    try {
      configObject = YAML.safeLoad(file);
    } catch (err) {
      eventBus.publish('log/error', `There is an error with your config file: ${err}`);
      process.exit(1);
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
};
