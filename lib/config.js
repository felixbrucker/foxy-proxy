const fs = require('fs');
const JSONbig = require('json-bigint');
const YAML = require('js-yaml');

module.exports = class Config {
  static get defaultConfig() {
    return {
      upstreams: [{
        name: 'Burst Solo',
        url: 'http://localhost:8125',
        mode: 'solo',
        passphrases: {
          '12345': 'asdf',
        },
        targetDL: 86400,
      }, {
        name: 'BHD Solo',
        isBHD: true,
        url: 'http://someuser:somepass@localhost:8732',
        mode: 'solo',
        targetDL: 86400,
      }, {
        name: 'HDPool',
        walletUrl: 'http://localhost:8732',
        mode: 'pool',
        type: 'hdpool',
        accountKey: '1234',
        targetDL: 31536000,
      }, {
        name: 'BHD HPool',
        isBHD: true,
        url: 'https://bhd.hpool.com',
        walletUrl: 'http://localhost:8732',
        mode: 'pool',
        accountKey: '1234',
        targetDL: 86400,
        sendTargetDL: 31536000,
        updateMiningInfoInterval: 3000,
      }],
      listenAddr: '127.0.0.1:12345',
    };
  }

  constructor(filePath) {
    this.filePath = filePath;
    this.migrateFromJSON();
    this.loadFromFile();
  }

  migrateFromJSON() {
    if (!fs.existsSync('config.json')) {
      return;
    }
    console.log(`${new Date().toISOString()} | old config file format detected, migrating to yaml ..`);
    const oldConfig = JSONbig.parse(fs.readFileSync('config.json'));
    fs.writeFileSync(this.filePath, YAML.safeDump(oldConfig));
    fs.unlinkSync('config.json');
  }

  loadFromFile() {
    let file;
    try {
      file = fs.readFileSync(this.filePath);
    } catch (err) {
      console.log(`${new Date().toISOString()} | first start detected, creating the config file (config.json), please adjust it to your preferences`);
      this.initFromObject();
      this.saveToFile();
      process.exit(0);
    }
    const configObject = YAML.safeLoad(file);
    this.initFromObject(configObject);
  }

  saveToFile() {
    const yaml = YAML.safeDump(this.config);
    fs.writeFileSync(this.filePath, yaml);
  }

  initFromObject(configObject = null) {
    this._config = configObject || Config.defaultConfig;
  }

  get useMultiplePorts() {
    return this.config.useMultiplePorts;
  }

  get upstreams() {
    return this.config.upstreams;
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
};
