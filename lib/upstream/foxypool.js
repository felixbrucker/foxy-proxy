const SocketIo = require('./socketio');

class FoxyPool extends SocketIo {
  async init() {
    if (!this.upstreamConfig.url) {
      this.upstreamConfig.url = 'http://miner.bhd.foxypool.cf/mining';
    }
    if (this.upstreamConfig.url.endsWith('/')) {
      this.upstreamConfig.url = this.upstreamConfig.url.slice(0, -1);
    }
    if (!this.upstreamConfig.url.endsWith('/mining')) {
      this.upstreamConfig.url += '/mining';
    }
    if (this.upstreamConfig.targetDL === undefined) {
      this.upstreamConfig.targetDL = 31536000;
    }
    this.upstreamConfig.mode = 'pool';
    this.isBHD = this.isBHD === undefined ? true : this.isBHD;
    await super.init();
  }
}

module.exports = FoxyPool;
