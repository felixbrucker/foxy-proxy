const BigNumber = require('bignumber.js');
const EventEmitter = require('events');
const moment = require('moment');
const eventBus = require('./services/event-bus');
const GenericUpstream = require('./upstream/generic');
const HDPool = require('./upstream/hdpool');
const HPool = require('./upstream/hpool');
const BurstGrpc = require('./upstream/burst-grpc');
const SocketIo = require('./upstream/socketio');
const FoxyPool = require('./upstream/foxypool');
const Submission = require('./submission');
const CurrentRoundManager = require('./currentRoundManager');
const outputUtil = require('./output-util');

class Proxy {
  static getUpstreamClass(type) {
    switch (type) {
      case 'hdpool':
      case 'hdpool-eco':
        return HDPool;
      case 'burst-grpc':
        return BurstGrpc;
      case 'socketio':
        return SocketIo;
      case 'foxypool':
        return FoxyPool;
      case 'hpool':
        return HPool;
      default:
        return GenericUpstream;
    }
  }

  constructor(proxyConfig) {
    this.currentRoundEmitter = new EventEmitter();
    this.proxyConfig = proxyConfig;
    this.maxScanTime = proxyConfig.maxScanTime || 30;
    this.minerOfflineMinutes = this.proxyConfig.minerOfflineMinutes || 5;
    this.minerOfflineBlocks = this.proxyConfig.minerOfflineBlocks || 2;
    this.currentRoundManager = new CurrentRoundManager(this.maxScanTime, this.currentRoundEmitter); // Default Round Manager
    this.currentRoundManagers = {};
    this.currentRoundManagers[this.maxScanTime] = this.currentRoundManager;
    this.miners = {};
    this.minerColor = this.proxyConfig.minerColor || null;
  }

  getFormattedDeadline(deadline) {
    if (!this.proxyConfig.humanizeDeadlines) {
      return deadline.toString();
    }

    const duration = moment.duration(deadline.toNumber(), 'seconds');
    if (duration.months() > 0) {
      return `${duration.months()}m ${duration.days()}d ${duration.hours().toString().padStart(2, '0')}:${duration.minutes().toString().padStart(2, '0')}:${duration.seconds().toString().padStart(2, '0')}`;
    } else if (duration.days() > 0) {
      return `${duration.days()}d ${duration.hours().toString().padStart(2, '0')}:${duration.minutes().toString().padStart(2, '0')}:${duration.seconds().toString().padStart(2, '0')}`;
    }

    return `${duration.hours().toString().padStart(2, '0')}:${duration.minutes().toString().padStart(2, '0')}:${duration.seconds().toString().padStart(2, '0')}`;
  }

  getDeadlineColor(deadline, limit = this.proxyConfig.dynamicDeadlineColorLimit || 2678400) {
    if (!this.proxyConfig.dynamicDeadlineColor) {
      return null;
    }

    if (deadline.toNumber <= 600) {
      return '#00ffbb';
    }

    const percent = Math.min(Math.max((1 - ((deadline.toNumber()) / limit)), 0), 1);
    const red = percent < 0.5 ? 255 : Math.floor(255 - ((percent * 2) - 1) * 255);
    const green = percent > 0.5 ? 255 : Math.floor(percent * 2 * 255);

    return `#${red.toString(16).padStart(2, '0')}${green.toString(16).padStart(2, '0')}00`;
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
      if (upstreamConfig.type === 'hdpool-eco') {
        upstreamConfig.useEcoPool = true;
      }
      const upstream = new upstreamClass(upstreamConfig, this.miners, this.proxyConfig);

      upstream.on('new-round', (miningInfo) => {
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
    setInterval(this.detectMinerOffline.bind(this), 30 * 1000);
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
      submissionObj.deadline,
      submissionObj.secretPhrase
    );
    const minerName = options.minerName || 'unknown';
    const minerSoftware = options.userAgent || options.miner || 'unknown';
    const minerId = this.proxyConfig.ignoreMinerIP ?  minerName : `${options.ip}/${minerName}`;
    if (!this.miners[minerId]) {
      this.miners[minerId] = {
        accountIds: [],
      };
    }
    const prevCapacity = this.miners[minerId].capacity;
    this.miners[minerId].lastTimeActive = moment();
    this.miners[minerId].lastBlockActive = submission.height;
    this.miners[minerId].capacity = options.capacity ? parseInt(options.capacity, 10) : 0;
    this.miners[minerId].maxScanTime = maxScanTime;
    if (!this.miners[minerId].accountIds.find(accountId => accountId === submission.accountId)) {
      this.miners[minerId].accountIds.push(submission.accountId);
    }

    if (prevCapacity !== this.miners[minerId].capacity) {
      eventBus.publish('stats/proxy', this.proxyConfig.name, this.getProxyStats());
      this.upstreams.forEach(upstream => upstream.recalculateTotalCapacity());
    }

    if (!submission.isValid()) {
      eventBus.publish('log/error', `${outputUtil.getName(this.proxyConfig)} | ${outputUtil.getString(minerId, this.minerColor)} | Error: tried submitting invalid data`);

      return {
        error:  {
          message: 'submission has wrong format',
          code: 1,
        },
      };
    }
    const upstream = this.getUpstreamForHeight(submission.height);
    if (!upstream) {
      eventBus.publish('log/error', `${outputUtil.getName(this.proxyConfig)} | ${outputUtil.getString(minerId, this.minerColor)} | Error: tried submitting DL for a different round`);

      return {
        error: {
          message: 'submission is for different round',
          code: 2,
        },
      };
    }

    const fullUpstreamNameLogs = outputUtil.getFullUpstreamNameLogs(this.proxyConfig, upstream.upstreamConfig);

    // Skip DL verification and stats for client side solo mining submits
    if (submission.deadline.isNaN()) {
      const result = await upstream.submitNonce(submission, minerSoftware, options);
      if (result.error) {
        eventBus.publish('log/error', `${fullUpstreamNameLogs} | ${outputUtil.getString(minerId, upstream.minerColor)} | ` +
            `account=${outputUtil.getString(submission.accountId, upstream.accountColor)} | Error: tried submitting client side solo submission with nonce ` +
            `${submission.nonce.toString()}, failed with error: ${JSON.stringify(result.error)}`);

        return {
          error: result.error,
        };
      }

      let realResult = result.result;
      if (realResult.result === 'success') {
        eventBus.publish('log/info', `${fullUpstreamNameLogs} | ${outputUtil.getString(minerId, upstream.minerColor)} | ` +
            `account=${outputUtil.getString(submission.accountId, upstream.accountColor)} | submitted client side solo submission with nonce ` +
            `${submission.nonce.toString()}`);
      } else {
        eventBus.publish('log/error', `${fullUpstreamNameLogs} | ${outputUtil.getString(minerId, upstream.minerColor)} | ` +
            `account=${outputUtil.getString(submission.accountId, upstream.accountColor)} | Error: tried submitting client side solo submission with nonce ` +
            `${submission.nonce.toString()}, failed with error: ${JSON.stringify(realResult.error)}`);
      }

      return realResult;
    }

    // Probably safe as integer, but use bignum just in case
    const adjustedDL = submission.deadline.dividedBy(upstream.miningInfo.baseTarget).integerValue(BigNumber.ROUND_FLOOR);

    const bestDLForAcc = upstream.deadlines[submission.accountId];

    // Do not submit worse DLs than already submitted
    if (bestDLForAcc && bestDLForAcc.isLessThanOrEqualTo(adjustedDL)) {
      const submitAllDeadlines = !!upstream.upstreamConfig.submitAllDeadlines;
      if (!submitAllDeadlines) {
        return {
          result: 'success',
          deadline: adjustedDL.toNumber(),
        };
      }
    } else {
      upstream.deadlines[submission.accountId] = adjustedDL;
      eventBus.publish('stats/current-round', upstream.fullUpstreamName, upstream.getCurrentRoundStats());
    }

    const targetDLForAccountId = upstream.upstreamConfig.accountIdToTargetDL && upstream.upstreamConfig.accountIdToTargetDL[submission.accountId];
    let targetDL = targetDLForAccountId || upstream.upstreamConfig.targetDL;
    if (!targetDL && upstream.useSubmitProbability) {
      const totalCapacityInTB = this.getTotalCapacity() / Math.pow(1024, 4);
      targetDL = Math.round(upstream.targetDLFactor * upstream.miningInfo.netDiff / totalCapacityInTB);
    }

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
    const deadlineColor = this.getDeadlineColor(adjustedDL) || upstream.deadlineColor;
    if (result.error) {
      eventBus.publish('log/error', `${fullUpstreamNameLogs} | ${outputUtil.getString(minerId, upstream.minerColor)} | ` +
          `account=${outputUtil.getString(submission.accountId, upstream.accountColor)} | Error: tried submitting DL ${outputUtil.getString(this.getFormattedDeadline(adjustedDL), deadlineColor)}, failed with error ` +
          `${JSON.stringify(result.error)}`);

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
      eventBus.publish('log/info', `${fullUpstreamNameLogs} | ${outputUtil.getString(minerId, upstream.minerColor)} | ` +
          `account=${outputUtil.getString(submission.accountId, upstream.accountColor)} | submitted DL ${outputUtil.getString(this.getFormattedDeadline(adjustedDL), deadlineColor)}`);
    } else {
      eventBus.publish('log/error', `${fullUpstreamNameLogs} | ${outputUtil.getString(minerId, upstream.minerColor)} | ` +
          `account=${outputUtil.getString(submission.accountId, upstream.accountColor)} | Error: tried submitting DL ${outputUtil.getString(this.getFormattedDeadline(adjustedDL), deadlineColor)}, failed with error ` +
          `${JSON.stringify(realResult.error)}`);
    }

    return realResult;
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

  detectMinerOffline() {
    Object.keys(this.miners).forEach(minerId => {
      const miner = this.miners[minerId];
      const lastActiveDiffMin = moment().diff(miner.lastTimeActive, 'minutes');
      if (lastActiveDiffMin < this.minerOfflineMinutes) {
        if (miner.offlineSince) {
          eventBus.publish('miner/online', minerId, miner.offlineSince);
          miner.offlineSince = null;
        }
        return;
      }
      const lastBlockActive = miner.lastBlockActive;
      const currentBlockHeights = this.upstreams.map(upstream => upstream.miningInfo.height);
      const lastActiveWarn = currentBlockHeights.every(height => {
        const diff = Math.abs(lastBlockActive - height);

        return diff >= this.minerOfflineBlocks;
      });
      if (!lastActiveWarn) {
        if (miner.offlineSince) {
          eventBus.publish('miner/online', minerId, miner.offlineSince);
          miner.offlineSince = null;
        }
        return;
      }
      if (miner.offlineSince) {
        return;
      }

      miner.offlineSince = miner.lastTimeActive;
      eventBus.publish('miner/offline', minerId, miner);
    });
  }

  getProxyStats() {
    const totalCapacity = this.getTotalCapacity();

    return {
      miner: this.miners,
      totalCapacity,
    };
  }

  getTotalCapacity() {
    const miners = Object.keys(this.miners).map(key => this.miners[key]);

    return miners.reduce((acc, miner) => {
      return acc + (miner.capacity || 0);
    }, 0);
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
