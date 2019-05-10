const superagent = require('superagent');
const eventBus = require('../services/event-bus');
const version = require('../version');
const GenericUpstream = require('./generic');

class HPool extends GenericUpstream {
  async init() {
    if (!this.upstreamConfig.url) {
      this.upstreamConfig.url = 'https://bhd.hpool.com';
    }
    if (!this.upstreamConfig.targetDL) {
      this.upstreamConfig.targetDL = 86400;
    }
    if (!this.upstreamConfig.sendTargetDL) {
      this.upstreamConfig.sendTargetDL = 31536000;
    }
    this.upstreamConfig.mode = 'pool';
    this.isBHD = true;
    await super.init();
    setInterval(this.updateMinerStatus.bind(this), 60 * 1000);
  }

  async updateMinerStatus() {
    try {
      const userAgent = `BHD-Burst-Proxy ${version}`;
      let request = superagent.post(`${this.upstreamConfig.url}/proxy/uploadminerstatus`)
        .send([{
          'X-Account': this.upstreamConfig.accountKey,
          'X-Capacity': this.totalCapacity,
          'X-ClientIP': '127.0.0.1',
          'X-Miner': userAgent,
          'X-Minername': this.upstreamConfig.minerName || this.defaultMinerName,
        }])
        .timeout({
          response: 30 * 1000,
          deadline: 45 * 1000,
        })
        .set('User-Agent', userAgent)
        .set('X-Proxy', userAgent)
        .set('X-Proxyname', this.upstreamConfig.minerName || this.defaultMinerName);

      await request.retry(3);
    } catch (err) {
      const message = (err.timeout || err.message === 'Aborted') ? 'uploadMinerStatus request timed out' : err.message;
      eventBus.publish('log/debug', `${this.fullUpstreamNameLogs} | Error: ${message}`);
    }
  }
}

module.exports = HPool;
