const util = require('./util');

class Store {
  constructor() {
    this.configFilePath = util.detectFilePath('config.yaml');
    this.dbFilePath = util.detectFilePath('db.sqlite');
    this.useLiveDashboard = false;
    this.proxies = [];
    this.logLevel = 'info';
  }

  setLogLevel(logLevel) {
    this.logLevel = logLevel;
  }

  getLogLevel() {
    return this.logLevel;
  }

  setConfigFilePath(filePath) {
    this.configFilePath = filePath;
  }

  setDbFilePath(filePath) {
    this.dbFilePath = filePath;
  }

  getConfigFilePath() {
    return this.configFilePath;
  }

  getDbFilePath() {
    return this.dbFilePath;
  }

  getUseLiveDashboard() {
    return this.useLiveDashboard;
  }

  setUseLiveDashboard(useLiveDashboard) {
    this.useLiveDashboard = useLiveDashboard;
  }

  getProxies() {
    return this.proxies;
  }

  setProxies(proxies) {
    this.proxies = proxies;
  }
}

module.exports = new Store();
