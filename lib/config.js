const fs = require('fs');

module.exports = class Config {
  static get defaultUpstreams() {
    return [{
      name: 'burst',
      url: 'http://localhost:8125',
      mode: 'solo',
      passphrases: {
        '12345': 'asdf',
      },
      targetDL: 86400,
    }, {
      name: 'bhd',
      url: 'http://localhost:8732',
      mode: 'solo',
      passphrases: {
        '12345': 'asdf',
      },
      targetDL: 86400,
    }];
  }

  static get defaultListenAddr() {
    return '127.0.0.1:12345';
  }

  constructor(filePath) {
    this.filePath = filePath;
    this.loadFromFile();
  }

  loadFromFile() {
    try {
      const file = fs.readFileSync(this.filePath);
      const configObject = JSON.parse(file);
      this.initFromObject(configObject);
    } catch (err) {
      this.initFromObject();
      this.saveToFile();
    }
  }

  saveToFile() {
    const json = JSON.stringify({
      upstreams: this.upstreams,
      listenAddr: this.listenAddr,
    }, null, 2);
    fs.writeFileSync(this.filePath, json);
  }

  initFromObject(configObject = {}) {
    this._upstreams = configObject.upstreams || Config.defaultUpstreams;
    this._listenAddr = configObject.listenAddr || Config.defaultListenAddr;
  }

  get upstreams() {
    return this._upstreams;
  }

  get listenAddr() {
    return this._listenAddr;
  }

  get listenHost() {
    return this._listenAddr.split(':')[0];
  }

  get listenPort() {
    return this._listenAddr.split(':')[1];
  }


};
