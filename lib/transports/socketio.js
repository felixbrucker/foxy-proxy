const chalk = require('chalk');
const eventBus = require('../services/event-bus');
const store = require('../services/store');
const outputUtil = require('../output-util');

class SocketIoTransport {
  constructor(io, listenAddr) {
    this.io = io;
    this.listenAddr = listenAddr;
  }

  addProxies(proxies) {
    this.proxies = proxies.map(proxy => {
      const result = {
        proxy,
      };

      const endpoint = `/${encodeURIComponent(proxy.proxyConfig.name.toLowerCase().replace(/ /g, '-'))}`;
      const localIo = this.io.of(endpoint);
      localIo.on('connection', (socket) => {
        let maxScanTime = proxy.maxScanTime;
        const handleNewRound = (miningInfo) => {
          socket.emit('miningInfo', miningInfo);
        };
        proxy.currentRoundManagers[maxScanTime].eventEmitter.on('new-round', handleNewRound);

        socket.on('setMaxScanTime', newMaxScanTime => {
          proxy.currentRoundManagers[maxScanTime].eventEmitter.removeListener('new-round', handleNewRound);
          maxScanTime = newMaxScanTime;
          proxy.currentRoundManagers[maxScanTime].eventEmitter.on('new-round', handleNewRound);
        });

        socket.on('getMiningInfo', async (cb) => {
          cb(proxy.getMiningInfo(maxScanTime));
        });

        socket.on('submitNonce', async (submission, options, cb) => {
          options.ip = socket.conn.remoteAddress;
          const res = await proxy.submitNonce(submission, options);
          cb(res);
        });

        socket.on('disconnect', () => {
          proxy.currentRoundManagers[maxScanTime].eventEmitter.removeListener('new-round', handleNewRound);
        });
      });

      const startupLine = `${outputUtil.getName(proxy.proxyConfig)} | Proxy configured and reachable via http://${this.listenAddr}${endpoint} (socket.io)`;
      eventBus.publish('log/info', store.getUseColors() ? chalk.cyan(startupLine) : startupLine);

      return result;
    });
  }
}

module.exports = SocketIoTransport;
