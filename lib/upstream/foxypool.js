const SocketIo = require('./socketio');

class FoxyPool extends SocketIo {
  async init() {
    if (!this.upstreamConfig.url) {
      this.upstreamConfig.url = 'https://foxypool.bhd.network/mining';
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
