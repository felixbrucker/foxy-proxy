const BigNumber = require('bignumber.js');
const bytes = require('bytes');
const moment = require('moment');
const eventBus = require('./event-bus');
const GenericUpstream = require('./upstream/generic');
const HDPool = require('./upstream/hdpool');
const Submission = require('./submission');
const CurrentRoundManager = require('./currentRoundManager');

class Proxy {
  static getUpstreamClass(type) {
    switch (type) {
      case 'hdpool':
        return HDPool;
      default:
        return GenericUpstream;
    }
  }

  constructor(proxyConfig) {
    this.proxyConfig = proxyConfig;
    this.currentRoundManager = new CurrentRoundManager();
    this.miners = {};
  }

  async init() {
    this.upstreams = await Promise.all(this.proxyConfig.upstreams.map(async upstreamConfig => {
      const upstreamClass = Proxy.getUpstreamClass(upstreamConfig.type);
      const upstream = new upstreamClass(upstreamConfig, this.miners);

      upstream.on('new-round', (miningInfo) => {
        this.currentRoundManager.addNewRound(upstream, miningInfo);
      });

      await upstream.init();

      return upstream;
    }));

    setInterval(this.updateMiners.bind(this), 60 * 1000);
  }

  getMiningInfo() {
    return this.currentRoundManager.getMiningInfo();
  }

  getUpstreamForHeight(height) {
    return this.upstreams.find(upstream => upstream.getMiningInfo().height === height);
  }

  async handleSubmitNonce(ctx) {
    const submission = new Submission(
      ctx.query.accountId,
      ctx.query.blockheight,
      ctx.query.nonce,
      ctx.query.deadline
    );
    const minerName = ctx.req.headers['x-minername'] || ctx.req.headers['x-miner'];
    const minerId = `${ctx.request.ip}/${minerName}`;
    if (!this.miners[minerId]) {
      this.miners[minerId] = {};
    }
    this.miners[minerId].lastTimeActive = moment();
    this.miners[minerId].capacity = bytes(`${ctx.req.headers['x-capacity']}GB`);

    if (!submission.isValid()) {
      ctx.status = 400;
      ctx.body = {
        error: {
          message: 'submission has wrong format',
          code: 1,
        },
      };
      return;
    }
    const upstream = this.getUpstreamForHeight(submission.height);
    if (!upstream) {
      ctx.status = 400;
      ctx.body = {
        error: {
          message: 'submission is for different round',
          code: 2,
        },
      };
      return;
    }

    // Probably safe as integer, but use bignum just in case
    const adjustedDL = submission.deadline.dividedBy(upstream.miningInfo.baseTarget).integerValue(BigNumber.ROUND_FLOOR);

    const bestDLForAcc = upstream.deadlines[submission.accountId];

    // Do not submit worse DLs than already submitted
    if (bestDLForAcc && bestDLForAcc.isLessThanOrEqualTo(adjustedDL)) {
      ctx.body = {
        result: 'success',
        deadline: adjustedDL.toNumber(),
      };
      return;
    }

    upstream.deadlines[submission.accountId] = adjustedDL;
    eventBus.publish('stats/new');

    // DL too high to submit
    if (adjustedDL.isGreaterThan(upstream.upstreamConfig.targetDL)) {
      ctx.body = {
        result: 'success',
        deadline: adjustedDL.toNumber(),
      };
      return;
    }
    if (upstream.miningInfo.targetDeadline && adjustedDL.isGreaterThan(upstream.miningInfo.targetDeadline)) {
      ctx.body = {
        result: 'success',
        deadline: adjustedDL.toNumber(),
      };
      return;
    }

    const result = await upstream.submitNonce(submission, ctx);
    if (result.error) {
      console.error(`${new Date().toISOString()} | ${upstream.upstreamConfig.name} | ${minerId} | account=${submission.accountId} | tried submitting DL ${adjustedDL.toString()}, failed`);
      ctx.status = 400;
      ctx.body = {
        error: result.error,
      };
      return;
    }

    let realResult = result.result;
    if (!realResult) {
      // emulate response
      realResult = {
        result: 'success',
        deadline: adjustedDL.toNumber(),
      };
    }
    if (realResult.result === 'success') {
      console.log(`${new Date().toISOString()} | ${upstream.upstreamConfig.name} | ${minerId} | account=${submission.accountId} | submitted DL ${adjustedDL.toString()}`);
    } else {
      console.error(`${new Date().toISOString()} | ${upstream.upstreamConfig.name} | ${minerId} | account=${submission.accountId} | tried submitting DL ${adjustedDL.toString()}, failed`);
    }

    ctx.body = realResult
  }

  updateMiners() {
    // Remove stale miners
    Object.keys(this.miners).forEach(key => {
      if (this.miners[key].lastTimeActive.isAfter(moment().subtract(1, 'hour'))) {
        return;
      }
      delete this.miners[key];
    });
  }

  async getStats() {
    const miners = Object.keys(this.miners).map(key => this.miners[key]);
    const totalCapacity = miners.reduce((acc, miner) => {
      return acc + (miner.capacity || 0);
    }, 0);

    const upstreamStats = await Promise.all(this.upstreams.map(async upstream => {
      const stats = await upstream.getStats();

      return {
        upstream: upstream.upstreamConfig.name,
        stats,
      };
    }));

    return {
      name: this.proxyConfig.name,
      upstreamStats,
      miner: this.miners,
      totalCapacity,
    };
  }
}

module.exports = Proxy;