const BigNumber = require('bignumber.js');
const bytes = require('bytes');
const EventEmitter = require('events');
const moment = require('moment');
const eventBus = require('./services/event-bus');
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
    this.currentRoundEmitter = new EventEmitter();
    this.proxyConfig = proxyConfig;
    this.maxScanTime = proxyConfig.maxScanTime || 30;
    this.currentRoundManager = new CurrentRoundManager(this.maxScanTime, this.currentRoundEmitter); // Default Round Manager
    this.currentRoundManagers = {};
    this.currentRoundManagers[this.maxScanTime] = this.currentRoundManager;
    this.miners = {};
  }

  async init() {
    this.currentRoundEmitter.on('current-round/new', () => {
      const miners = Object.keys(this.miners).map(key => this.miners[key]);
      miners.forEach(miner => {
        const currentRoundManager = miner.maxScanTime ? this.currentRoundManagers[miner.maxScanTime] : this.currentRoundManager;
        miner.startedAt = currentRoundManager.getCurrentRound().getStartedAt();
        miner.currentHeightScanning = currentRoundManager.getCurrentRound().getHeight();
      });
      eventBus.publish('stats/proxy', this.proxyConfig.name, this.getProxyStats());
    });
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

    this.upstreams.forEach(upstream => upstream.recalculateTotalCapacity());
    setInterval(this.updateMiners.bind(this), 60 * 1000);
  }

  getMiningInfo(maxScanTime) {
    if (!maxScanTime) {
      return this.currentRoundManager.getMiningInfo();
    }

    if (!this.currentRoundManagers[maxScanTime]) {
      this.currentRoundManagers[maxScanTime] = new CurrentRoundManager(maxScanTime, this.currentRoundEmitter);
      this.currentRoundManagers[maxScanTime].copyRoundsFromManager(this.currentRoundManager);
    }

    return this.currentRoundManagers[maxScanTime].getMiningInfo();
  }

  getUpstreamForHeight(height) {
    return this.upstreams.find(upstream => upstream.getMiningInfo().height === height);
  }

  async submitNonce(submissionObj, options) {
    let currentRoundManager = this.currentRoundManager;

    let maxScanTime = options.maxScanTime && parseInt(options.maxScanTime, 10) || null;
    if (maxScanTime && !this.currentRoundManagers[maxScanTime]) {
      this.currentRoundManagers[maxScanTime] = new CurrentRoundManager(maxScanTime, this.currentRoundEmitter);
      this.currentRoundManagers[maxScanTime].copyRoundsFromManager(this.currentRoundManager);
    }
    if (maxScanTime) {
      currentRoundManager = this.currentRoundManagers[maxScanTime];
    } else {
      maxScanTime = this.maxScanTime;
    }

    const blockHeight = submissionObj.blockheight || currentRoundManager.getMiningInfo().height;
    const submission = new Submission(
      submissionObj.accountId,
      blockHeight,
      submissionObj.nonce,
      submissionObj.deadline
    );
    const minerName = options.minerName || 'unknown';
    const minerSoftware = options.userAgent || options.miner || 'unknown';
    const minerId = this.proxyConfig.ignoreMinerIP ?  minerName : `${options.ip}/${minerName}`;
    if (!this.miners[minerId]) {
      this.miners[minerId] = {};
    }
    const prevCapacity = this.miners[minerId].capacity;
    this.miners[minerId].lastTimeActive = moment();
    this.miners[minerId].lastBlockActive = submission.height;
    this.miners[minerId].capacity = bytes(`${options.capacity || 0}GB`);
    this.miners[minerId].maxScanTime = maxScanTime;

    if (prevCapacity !== this.miners[minerId].capacity) {
      eventBus.publish('stats/proxy', this.proxyConfig.name, this.getProxyStats());
      this.upstreams.forEach(upstream => upstream.recalculateTotalCapacity());
    }

    if (!submission.isValid()) {
      return {
        error:  {
          message: 'submission has wrong format',
          code: 1,
        },
      };
    }
    const upstream = this.getUpstreamForHeight(submission.height);
    if (!upstream) {
      return {
        error: {
          message: 'submission is for different round',
          code: 2,
        },
      };
    }

    // Probably safe as integer, but use bignum just in case
    const adjustedDL = submission.deadline.dividedBy(upstream.miningInfo.baseTarget).integerValue(BigNumber.ROUND_FLOOR);

    const bestDLForAcc = upstream.deadlines[submission.accountId];

    // Do not submit worse DLs than already submitted
    if (bestDLForAcc && bestDLForAcc.isLessThanOrEqualTo(adjustedDL)) {
      return {
        result: 'success',
        deadline: adjustedDL.toNumber(),
      };
    }

    upstream.deadlines[submission.accountId] = adjustedDL;
    eventBus.publish('stats/current-round', upstream.fullUpstreamName, upstream.getCurrentRoundStats());

    const targetDLForAccountId = upstream.upstreamConfig.accountIdToTargetDL && upstream.upstreamConfig.accountIdToTargetDL[submission.accountId];
    const targetDL = targetDLForAccountId || upstream.upstreamConfig.targetDL;

    // DL too high to submit
    if (adjustedDL.isGreaterThan(targetDL)) {
      return {
        result: 'success',
        deadline: adjustedDL.toNumber(),
      };
    }
    if (upstream.miningInfo.targetDeadline && adjustedDL.isGreaterThan(upstream.miningInfo.targetDeadline)) {
      return {
        result: 'success',
        deadline: adjustedDL.toNumber(),
      };
    }

    const result = await upstream.submitNonce(submission, minerSoftware, options);
    if (result.error) {
      eventBus.publish('log/error', `${this.proxyConfig.name} | ${upstream.upstreamConfig.name} | ${minerId} | account=${submission.accountId} | Error: tried submitting DL ${adjustedDL.toString()}, failed`);
      return {
        error: result.error,
      };
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

    return realResult
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
      maxScanTime: this.maxScanTime,
      ...proxyStats,
      upstreamStats,
    };
  }
}

module.exports = Proxy;
