const util = require('./util');

class Store {
  constructor() {
    this.configFilePath = util.detectFilePath('config.yaml');
    this.dbFilePath = util.detectFilePath('db.sqlite');
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
}

module.exports = new Store();
