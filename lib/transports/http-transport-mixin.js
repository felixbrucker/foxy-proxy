const eventBus = require('../services/event-bus');

class HttpTransportMixin {
  static handleGet(ctx, proxy) {
    const maxScanTime = ctx.params.maxScanTime && parseInt(ctx.params.maxScanTime, 10) || null;
    const requestType = ctx.query.requestType;
    switch (requestType) {
      case 'getMiningInfo':
        ctx.body = proxy.getMiningInfo(maxScanTime);
        break;
      default:
        eventBus.publish('log/info', `${proxy.proxyConfig.name} | unknown requestType ${requestType} with data: ${JSON.stringify(ctx.params)}. Please message this info to the creator of this software.`);
        ctx.status = 400;
        ctx.body = {
          error: {
            message: 'unknown request type',
            code: 4,
          },
        };
    }
  }

  static async handlePost(ctx, proxy) {
    const maxScanTime = ctx.params.maxScanTime && parseInt(ctx.params.maxScanTime, 10) || null;
    const requestType = ctx.query.requestType;
    switch (requestType) {
      case 'getMiningInfo':
        ctx.body = proxy.getMiningInfo(maxScanTime);
        break;
      case 'submitNonce':
        await proxy.handleSubmitNonce(ctx);
        break;
      default:
        eventBus.publish('log/info', `${proxy.proxyConfig.name} | unknown requestType ${requestType} with data: ${JSON.stringify(ctx.params)}. Please message this info to the creator of this software.`);
        ctx.status = 400;
        ctx.body = {
          error: {
            message: 'unknown request type',
            code: 4,
          },
        };
    }
  }
}

module.exports = HttpTransportMixin;
