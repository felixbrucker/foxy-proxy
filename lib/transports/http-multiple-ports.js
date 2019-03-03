const bodyParser = require('koa-bodyparser');
const http = require('http');
const Koa = require('koa');
const Router = require('koa-router');
const Sentry = require('@sentry/node');
const eventBus = require('../services/event-bus');
const HttpTransportMixin = require('./http-transport-mixin');

class HttpMultiplePortsTransport extends HttpTransportMixin {
  constructor(listenHost, listenPortStart) {
    super();
    this.listenHost = listenHost;
    this.listenPortStart = listenPortStart;
  }

  addProxies(proxies) {
    this.proxies = proxies.map((proxy, index) => {
      const result = {
        proxy,
      };

      const localApp = new Koa();
      localApp.on('error', err => {
        eventBus.publish('log/error', `Error: ${err.message}`);
        Sentry.captureException(err);
      });
      const localRouter = new Router();
      localApp.use(bodyParser());
      const endpointWithScanTime = '/:maxScanTime';
      localRouter.get('/burst', (ctx) => HttpTransportMixin.handleGet(ctx, proxy));
      localRouter.post('/burst', (ctx) => HttpTransportMixin.handlePost(ctx, proxy));
      localRouter.get(`${endpointWithScanTime}/burst`, (ctx) => HttpTransportMixin.handleGet(ctx, proxy));
      localRouter.post(`${endpointWithScanTime}/burst`, (ctx) => HttpTransportMixin.handlePost(ctx, proxy));
      localApp.use(localRouter.routes());
      localApp.use(localRouter.allowedMethods());
      const localServer = http.createServer(localApp.callback());
      const listenPort = this.listenPortStart + index + 1;
      const listenAddr = `${this.listenHost}:${listenPort}`;
      localServer.listen(listenPort, this.listenHost);
      result.server = localServer;

      eventBus.publish('log/info', `${proxy.proxyConfig.name} | Proxy configured and reachable via http://${listenAddr}`);

      return result;
    });
  }
}

module.exports = HttpMultiplePortsTransport;
