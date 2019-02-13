const BigNumber = require('bignumber.js');
const bytes = require('bytes');
const moment = require('moment');
const eventBus = require('./event-bus');
const GenericUpstream = require('./upstream/generic');
const HDPool = require('./upstream/hdpool');
const BurstGrpc = require('./upstream/burst-grpc');
const Submission = require('./submission');
const CurrentRoundManager = require('./currentRoundManager');

class Proxy {
  static getUpstreamClass(type) {
    switch (type) {
      case 'hdpool':
        return HDPool;
      case 'burst-grpc':
        return BurstGrpc;
      default:
        return GenericUpstream;
    }
  }

  constructor(proxyConfig) {
    this.proxyConfig = proxyConfig;
    this.maxScanTime = proxyConfig.maxScanTime || 30;
    this.currentRoundManager = new CurrentRoundManager(this.maxScanTime); // Default Round Manager
    this.currentRoundManagers = {};
    this.miners = {};
  }

  async init() {
    this.upstreams = await Promise.all(this.proxyConfig.upstreams.map(async upstreamConfig => {
      const upstreamClass = Proxy.getUpstreamClass(upstreamConfig.type);
      const upstream = new upstreamClass(upstreamConfig, this.miners, this.proxyConfig.name);

      upstream.on('new-round', (miningInfo) => {
        this.currentRoundManager.addNewRound(upstream, miningInfo);
        Object.keys(this.currentRoundManagers)
          .map(maxScanTime => this.currentRoundManagers[maxScanTime])
          .forEach(currentRoundManager => {
            currentRoundManager.addNewRound(upstream, miningInfo);
          });
      });

      await upstream.init();

      return upstream;
    }));

    setInterval(this.updateMiners.bind(this), 60 * 1000);
  }

  getMiningInfo(maxScanTime) {
    if (!maxScanTime) {
      return this.currentRoundManager.getMiningInfo();
    }

    if (!this.currentRoundManagers[maxScanTime]) {
      this.currentRoundManagers[maxScanTime] = new CurrentRoundManager(maxScanTime);
      this.currentRoundManagers[maxScanTime].copyRoundsFromManager(this.currentRoundManager);
    }

    return this.currentRoundManagers[maxScanTime].getMiningInfo();
  }

  getUpstreamForHeight(height) {
    return this.upstreams.find(upstream => upstream.getMiningInfo().height === height);
  }

  async handleSubmitNonce(ctx) {
    let currentRoundManager = this.currentRoundManager;

    const maxScanTime = ctx.params.maxScanTime && parseInt(ctx.params.maxScanTime, 10) || null;
    if (maxScanTime && !this.currentRoundManagers[maxScanTime]) {
      this.currentRoundManagers[maxScanTime] = new CurrentRoundManager(maxScanTime);
      this.currentRoundManagers[maxScanTime].copyRoundsFromManager(this.currentRoundManager);
    }
    if (maxScanTime) {
      currentRoundManager = this.currentRoundManagers[maxScanTime];
    }

    const blockHeight = ctx.query.blockheight || currentRoundManager.getMiningInfo().height;
    const submission = new Submission(
      ctx.query.accountId,
      blockHeight,
      ctx.query.nonce,
      ctx.query.deadline
    );
    const minerName = ctx.req.headers['x-minername'] || ctx.req.headers['x-miner'] || 'unknown';
    const minerSoftware = ctx.req.headers['user-agent'] || ctx.req.headers['x-miner'] || 'unknown';
    const minerId = `${ctx.request.ip}/${minerName}`;
    if (!this.miners[minerId]) {
      this.miners[minerId] = {};
    }
    const prevCapacity = this.miners[minerId].capacity;
    this.miners[minerId].lastTimeActive = moment();
    this.miners[minerId].capacity = bytes(`${ctx.req.headers['x-capacity']}GB`);

    if (prevCapacity !== this.miners[minerId].capacity) {
      eventBus.publish('stats/proxy', this.proxyConfig.name, this.getProxyStats());
    }

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
    eventBus.publish('stats/current-round', upstream.fullUpstreamName, upstream.getCurrentRoundStats());

    const targetDLForAccountId = upstream.upstreamConfig.accountIdToTargetDL && upstream.upstreamConfig.accountIdToTargetDL[submission.accountId];
    const targetDL = targetDLForAccountId || upstream.upstreamConfig.targetDL;

    // DL too high to submit
    if (adjustedDL.isGreaterThan(targetDL)) {
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

    const result = await upstream.submitNonce(submission, minerSoftware, ctx);
    if (result.error) {
      eventBus.publish('log/error', `${this.proxyConfig.name} | ${upstream.upstreamConfig.name} | ${minerId} | account=${submission.accountId} | Error: tried submitting DL ${adjustedDL.toString()}, failed`);
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
      eventBus.publish('log/info', `${this.proxyConfig.name} | ${upstream.upstreamConfig.name} | ${minerId} | account=${submission.accountId} | submitted DL ${adjustedDL.toString()}`);
    } else {
      eventBus.publish('log/error', `${this.proxyConfig.name} | ${upstream.upstreamConfig.name} | ${minerId} | account=${submission.accountId} | Error: tried submitting DL ${adjustedDL.toString()}, failed`);
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
      eventBus.publish('stats/proxy', this.proxyConfig.name, this.getProxyStats());
    });
  }

  getProxyStats() {
    const miners = Object.keys(this.miners).map(key => this.miners[key]);
    const totalCapacity = miners.reduce((acc, miner) => {
      return acc + (miner.capacity || 0);
    }, 0);

    return {
      miner: this.miners,
      totalCapacity,
    };
  }

  async getStats() {
    const proxyStats = this.getProxyStats();
    const upstreamStats = await Promise.all(this.upstreams.map(upstream => upstream.getStats()));

    return {
      name: this.proxyConfig.name,
      macScanTime: this.maxScanTime,
      ...proxyStats,
      upstreamStats,
    };
  }
}

module.exports = Proxy;