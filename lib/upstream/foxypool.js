const superagent = require('superagent');
const eventBus = require('../services/event-bus');
const version = require('../version');
const SocketIo = require('./socketio');

class FoxyPool extends SocketIo {
  async init() {
    if (!this.upstreamConfig.url) {
      this.upstreamConfig.url = 'https://foxypool.bhd.network/mining';
    }
    if (!this.upstreamConfig.targetDL) {
      this.upstreamConfig.targetDL = 31536000;
    }
    this.upstreamConfig.mode = 'pool';
    this.isBHD = true;
    await super.init();
  }
}

module.exports = FoxyPool;
