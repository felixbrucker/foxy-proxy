const eventBus = require('../services/event-bus');

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
        const handleNewRound = () => {
          socket.emit('miningInfo', proxy.getMiningInfo());
        };
        proxy.currentRoundEmitter.on('current-round/new', handleNewRound);

        socket.on('submitNonce', async (submission, options, cb) => {
          options.ip = socket.conn.remoteAddress;
          const res = await proxy.submitNonce(submission, options);
          cb(res);
        });

        socket.on('disconnect', () => {
          proxy.currentRoundEmitter.removeListener('current-round/new', handleNewRound);
        });

        socket.emit('miningInfo', proxy.getMiningInfo());
      });

      eventBus.publish('log/info', `${proxy.proxyConfig.name} | Proxy configured and reachable via http://${this.listenAddr}${endpoint} (socket.io)`);

      return result;
    });
  }
}

module.exports = SocketIoTransport;
