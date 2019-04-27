const superagent = require('superagent');
const eventBus = require('../services/event-bus');
const version = require('../version');
const GenericUpstream = require('./generic');

class HPool extends GenericUpstream {
  async init() {
    this.upstreamConfig.url = 'https://bhd.hpool.com';
    this.upstreamConfig.targetDL = 86400;
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
        .set('User-Agent', userAgent)
        .set('X-Proxy', userAgent)
        .set('X-Proxyname', this.upstreamConfig.minerName || this.defaultMinerName);

      await request.retry(3);
    } catch (err) {
      eventBus.publish('log/error', `${this.fullUpstreamNameLogs} | Error: ${err.message}`);
    }
  }
}

module.exports = HPool;
