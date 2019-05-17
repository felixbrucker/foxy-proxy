const chalk = require('chalk');
const eventBus = require('../services/event-bus');
const store = require('../services/store');
const outputUtil = require('../output-util');
const HttpTransportMixin = require('./http-transport-mixin');

class HttpSinglePortTransport extends HttpTransportMixin {
  constructor(router, listenAddr) {
    super();
    this.router = router;
    this.listenAddr = listenAddr;
  }

  addProxies(proxies) {
    this.proxies = proxies.map(proxy => {
      const result = {
        proxy,
      };

      const endpoint = `/${encodeURIComponent(proxy.proxyConfig.name.toLowerCase().replace(/ /g, '-'))}`;
      const endpointWithScanTime = `${endpoint}/:maxScanTime`;
      this.router.get(`${endpoint}/burst`, (ctx) => HttpTransportMixin.handleGet(ctx, proxy));
      this.router.post(`${endpoint}/burst`, (ctx) => HttpTransportMixin.handlePost(ctx, proxy));
      this.router.get(`${endpointWithScanTime}/burst`, (ctx) => HttpTransportMixin.handleGet(ctx, proxy));
      this.router.post(`${endpointWithScanTime}/burst`, (ctx) => HttpTransportMixin.handlePost(ctx, proxy));

      const startupLine = `${outputUtil.getName(proxy.proxyConfig)} | Proxy configured and reachable via http://${this.listenAddr}${endpoint}`;
      eventBus.publish('log/info', store.getUseColors() ? chalk.blueBright(startupLine) : startupLine);

      return result;
    });
  }
}

module.exports = HttpSinglePortTransport;
