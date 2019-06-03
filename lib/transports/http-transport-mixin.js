const eventBus = require('../services/event-bus');
const outputUtil = require('../output-util');

class HttpTransportMixin {
  static handleGet(ctx, proxy) {
    const maxScanTime = ctx.params.maxScanTime && parseInt(ctx.params.maxScanTime, 10) || null;
    const requestType = ctx.query.requestType;
    switch (requestType) {
      case 'getMiningInfo':
        ctx.body = proxy.getMiningInfo(maxScanTime);
        break;
      default:
        eventBus.publish('log/error', `${outputUtil.getName(proxy.proxyConfig)} | unknown requestType ${requestType} with data: ${JSON.stringify(ctx.params)}. Please message this info to the creator of this software.`);
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
        const options = {
          ip: ctx.request.ip,
          maxScanTime: ctx.params.maxScanTime,
          minerName: ctx.req.headers['x-minername'] || ctx.req.headers['x-miner'],
          userAgent: ctx.req.headers['user-agent'],
          miner: ctx.req.headers['x-miner'],
          capacity: ctx.req.headers['x-capacity'],
          accountKey: ctx.req.headers['x-account'],
          payoutAddress: ctx.req.headers['x-account'],
          minerAlias: ctx.req.headers['x-mineralias'] || null,
        };
        const submissionObj = {
          accountId: ctx.query.accountId,
          blockheight: ctx.query.blockheight,
          nonce: ctx.query.nonce,
          deadline: ctx.query.deadline,
          secretPhrase: ctx.query.secretPhrase !== '' ? ctx.query.secretPhrase : null,
        };
        ctx.body = await proxy.submitNonce(submissionObj, options);
        if (ctx.body.error) {
          ctx.status = 400;
        }
        break;
      default:
        eventBus.publish('log/error', `${outputUtil.getName(proxy.proxyConfig)} | unknown requestType ${requestType} with data: ${JSON.stringify(ctx.params)}. Please message this info to the creator of this software.`);
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
