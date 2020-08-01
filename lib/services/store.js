const util = require('../util');

class Store {
  constructor() {
    this.configFilePath = util.detectFilePath('config.yaml');
    this.dbFilePath = util.detectFilePath('db.sqlite');
    this.useLiveDashboard = false;
    this.proxies = [];
    this.logging = {
      level: 'info',
      dir: null,
      maxFiles: null,
    };
    this.useColors = true;
    this._isInstalledGlobally = false;
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

  getMailSettings() {
    return this.mailSettings;
  }

  setMailSettings(mailSettings) {
    this.mailSettings = mailSettings;
  }

  getUseColors() {
    return this.useColors;
  }

  setUseColors(useColors) {
    this.useColors = useColors;
  }

  isInstalledGlobally() {
    return this._isInstalledGlobally;
  }

  setIsInstalledGlobally(isInstalledGlobally) {
    this._isInstalledGlobally = isInstalledGlobally;
  }
}

module.exports = new Store();
