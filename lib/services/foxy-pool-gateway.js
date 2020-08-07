const EventEmitter = require('events');
const io = require('socket.io-client');

const eventBus = require('./event-bus');

class FoxyPoolGateway {
  constructor() {
    this.url = 'http://miner.foxypool.io/mining';
    this.coins = [];
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(0);
    this.connected = false;
  }

  async init() {
    this.client = io(this.url, { rejectUnauthorized : false });

    this.client.on('connect', async () => {
      this.connected = true;
      this.emitter.emit('connection-state-change');
      eventBus.publish('log/debug', `Foxy-Pool-Gateway | url=${this.url} | Socket.IO connected`);
      const result = await this.subscribeToCoins();
      if (result.error) {
        eventBus.publish('log/error', `Foxy-Pool-Gateway | Error: ${result.error}`);
      }
      await Promise.all(this.coins.map(async coin => {
        const miningInfo = await this.getMiningInfo(coin);
        this.emitter.emit(`${coin}:miningInfo`, miningInfo);
      }));
    });
    this.client.on('disconnect', () => {
      this.connected = false;
      this.emitter.emit('connection-state-change');
      eventBus.publish('log/debug', `Foxy-Pool-Gateway | url=${this.url} | Socket.IO disconnected`);
    });

    this.client.on('miningInfo', (coin, miningInfo) => {
      this.connected = true;
      this.emitter.emit('connection-state-change');
      this.emitter.emit(`${coin}:miningInfo`, miningInfo);
    });
  }

  async subscribeToCoins() {
    return new Promise(resolve => this.client.emit('subscribe', this.coins, resolve));
  }

  onNewMiningInfo(coin, handler) {
    this.emitter.on(`${coin}:miningInfo`, handler);
  }

  onConnectionStateChange(handler) {
    this.emitter.on('connection-state-change', handler);
  }

  async getMiningInfo(coin) {
    return new Promise(resolve => this.client.emit('getMiningInfo', coin, resolve));
  }

  async submitNonce(coin, submission, options) {
    return new Promise(resolve => this.client.emit('submitNonce', coin, submission, options, resolve));
  }
}

module.exports = new FoxyPoolGateway();
