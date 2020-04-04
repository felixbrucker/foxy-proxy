const BigNumber = require('bignumber.js');
const EventEmitter = require('events');
const moment = require('moment');
const eventBus = require('./services/event-bus');
const GenericUpstream = require('./upstream/generic');
const HPool = require('./upstream/hpool');
const SocketIo = require('./upstream/socketio');
const FoxyPool = require('./upstream/foxypool');
const FoxyPoolMulti = require('./upstream/foxy-pool-multi');
const Submission = require('./submission');
const CurrentRoundManager = require('./currentRoundManager');
const outputUtil = require('./output-util');
const profitabilityService = require('./services/profitability-service');

class Proxy {
  static getUpstreamClass(upstreamConfig) {
    switch (upstreamConfig.type) {
      case 'socketio':
        return SocketIo;
      case 'foxypool':
        if (upstreamConfig.url || !upstreamConfig.coin) {
          return FoxyPool;
        }
        return FoxyPoolMulti;
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
    this.discardMultiSubmitDLsBelow = this.proxyConfig.discardMultiSubmitDLsBelow || 900;
  }

  getFormattedDeadline(deadline) {
    if (!this.proxyConfig.humanizeDeadlines) {
      return deadline.toString();
    }

    const duration = moment.duration(deadline.toNumber(), 'seconds');
    if (duration.years() > 0) {
      return `${duration.years()}y ${duration.months()}m ${duration.days()}d ${duration.hours().toString().padStart(2, '0')}:${duration.minutes().toString().padStart(2, '0')}:${duration.seconds().toString().padStart(2, '0')}`;
    } else if (duration.months() > 0) {
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

    if (deadline.toNumber() <= 600) {
      return '#00ffbb';
    }

    const percent = Math.min(Math.max((1 - ((deadline.toNumber()) / limit)), 0), 1);
    const red = percent < 0.5 ? 255 : Math.floor(255 - ((percent * 2) - 1) * 255);
    const green = percent > 0.5 ? 255 : Math.floor(percent * 2 * 255);

    return `#${red.toString(16).padStart(2, '0')}${green.toString(16).padStart(2, '0')}00`;
  }

  async init() {
    const enabledUpstreams = this.proxyConfig.upstreams.filter(upstreamConfig => !upstreamConfig.disabled);
    this.currentRoundEmitter.on('current-round/new', (currentRound) => {
      if (enabledUpstreams.length > 1) {
        eventBus.publish('log/debug', `${outputUtil.getName(this.proxyConfig)} | CurrentRoundManager [${currentRound.maxScanTime}] | Switched to ${outputUtil.getName(currentRound.upstream.upstreamConfig)}`);
      }
      const miners = Object.keys(this.miners).map(key => this.miners[key]);
      miners.forEach(miner => {
        const currentRoundManager = miner.maxScanTime ? this.currentRoundManagers[miner.maxScanTime] : this.currentRoundManager;
        miner.startedAt = currentRoundManager.getCurrentRound().getStartedAt();
        miner.currentHeightScanning = currentRoundManager.getCurrentRound().getHeight();
      });
      eventBus.publish('stats/proxy', this.proxyConfig.name, this.getProxyStats());
    });
    this.upstreams = await Promise.all(enabledUpstreams.map(async (upstreamConfig, index) => {
      const upstreamClass = Proxy.getUpstreamClass(upstreamConfig);
      const upstream = new upstreamClass(upstreamConfig, this.miners, this.proxyConfig);

      if (this.proxyConfig.multiSubmit && index !== 0) {
        await upstream.init();

        return upstream;
      }

      upstream.on('new-round', (miningInfo) => {
        if (this.proxyConfig.useProfitability) {
          upstream.weight = profitabilityService.getProfitability(upstream.miningInfo, upstream.upstreamConfig.coin.toLowerCase(), upstream.upstreamConfig.blockReward);
          eventBus.publish('log/debug', `Profitability-Service | ${upstream.fullUpstreamNameLogs} | Got weight ${upstream.weight}`);
        }
        if (this.upstreams && this.proxyConfig.maxNumberOfChains) {
          const weight = (upstream.upstreamConfig.weight || upstream.upstreamConfig.prio || upstream.weight) || 10;
          const upstreamsWithWeight = this.upstreams
            .map(upstream => [upstream, (upstream.upstreamConfig.weight || upstream.upstreamConfig.prio || upstream.weight) || 10])
            .sort((a, b) => b[1] - a[1])
            .slice(0, this.proxyConfig.maxNumberOfChains)
            .reverse();
          if (!upstreamsWithWeight.some(upstreamWithWeight => upstreamWithWeight[0] === upstream) && weight <= upstreamsWithWeight[0][1]) {
            eventBus.publish('log/debug', `${upstream.fullUpstreamNameLogs} | Not queuing new block because maxNumberOfChains is set to ${this.proxyConfig.maxNumberOfChains} and the weight is too low`);
            return;
          }
        }
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

  getUpstreamsForHeight(height) {
    return this.upstreams.filter(upstream => upstream.getMiningInfo().height === height);
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

    const blockHeight = submissionObj.height || currentRoundManager.getMiningInfo().height;
    const submission = new Submission(
      submissionObj.accountId,
      blockHeight,
      submissionObj.nonce,
      submissionObj.deadline,
      submissionObj.secretPhrase
    );
    const minerName = options.minerName || 'unknown';
    const minerSoftware = options.userAgent || options.miner || 'unknown';
    const minerId = this.proxyConfig.ignoreMinerIP ? minerName : `${options.ip}/${minerName}`;
    if (!this.miners[minerId]) {
      this.miners[minerId] = {
        accountIds: [],
      };
    }
    const miner = this.miners[minerId];
    const prevCapacity = miner.capacity;
    miner.lastTimeActive = moment();
    miner.lastBlockActive = submission.height;
    miner.capacity = options.capacity ? parseInt(options.capacity, 10) : 0;
    miner.maxScanTime = maxScanTime;
    if (!miner.accountIds.find(accountId => accountId === submission.accountId)) {
      miner.accountIds.push(submission.accountId);
    }
    if (options.color) {
      miner.color = options.color;
    }

    if (prevCapacity !== miner.capacity) {
      eventBus.publish('stats/proxy', this.proxyConfig.name, this.getProxyStats());
      this.upstreams.forEach(upstream => upstream.recalculateTotalCapacity());
    }

    if (!submission.isValid()) {
      eventBus.publish('log/error', `${outputUtil.getName(this.proxyConfig)} | ${outputUtil.getString(minerId, miner.color || this.minerColor)} | Error: tried submitting invalid data`);

      return {
        error: {
          message: 'submission has wrong format',
          code: 1,
        },
      };
    }
    const upstreams = this.getUpstreamsForHeight(submission.height);
    if (upstreams.length === 0) {
      eventBus.publish('log/error', `${outputUtil.getName(this.proxyConfig)} | ${outputUtil.getString(minerId, miner.color || this.minerColor)} | Error: tried submitting DL for a different round`);

      return {
        error: {
          message: 'submission is for different round',
          code: 2,
        },
      };
    }

    let returnValues = [];
    for (let i = 0; i < upstreams.length; i += 1) {
      const upstream = upstreams[i];
      const fullUpstreamNameLogs = upstream.fullUpstreamNameLogs;

      // Skip DL verification and stats for client side solo mining submits
      if (submission.deadline.isNaN()) {
        const result = await upstream.submitNonce(submission, minerSoftware, options);
        if (result.error) {
          eventBus.publish('log/error', `${fullUpstreamNameLogs} | ${outputUtil.getString(minerId, miner.color || upstream.minerColor)} | ` +
            `account=${outputUtil.getString(submission.accountId, outputUtil.getAccountColor(submission.accountId, upstream))} | Error: tried submitting client side solo submission with nonce ` +
            `${submission.nonce.toString()}, failed with error: ${JSON.stringify(result.error)}`);

          returnValues.push({
            error: result.error,
          });
          continue;
        }

        let realResult = result.result;
        if (!realResult) {
          eventBus.publish('log/error', `${fullUpstreamNameLogs} | ${outputUtil.getString(minerId, miner.color || upstream.minerColor)} | ` +
            `account=${outputUtil.getString(submission.accountId, outputUtil.getAccountColor(submission.accountId, upstream))} | Error: tried submitting client side solo submission to pool upstream`);

          returnValues.push({
            error: {
              message: 'client side solo submission to pool upstream',
              code: 13,
            },
          });
          continue;
        }
        if (realResult.result === 'success') {
          const deadlineColor = this.getDeadlineColor(realResult.deadline) || upstream.deadlineColor;
          eventBus.publish('log/info', `${fullUpstreamNameLogs} | ${outputUtil.getString(minerId, miner.color || upstream.minerColor)} | ` +
            `account=${outputUtil.getString(submission.accountId, outputUtil.getAccountColor(submission.accountId, upstream))} | submitted client side solo submission with nonce ` +
            `${submission.nonce.toString()} and DL ${outputUtil.getString(this.getFormattedDeadline(realResult.deadline), deadlineColor)}`);
        } else {
          const error = realResult.error || realResult;
          eventBus.publish('log/error', `${fullUpstreamNameLogs} | ${outputUtil.getString(minerId, miner.color || upstream.minerColor)} | ` +
            `account=${outputUtil.getString(submission.accountId, outputUtil.getAccountColor(submission.accountId, upstream))} | Error: tried submitting client side solo submission with nonce ` +
            `${submission.nonce.toString()}, failed with error: ${JSON.stringify(error)}`);
        }

        returnValues.push(realResult);
        continue;
      }

      // Probably safe as integer, but use bignum just in case
      const adjustedDL = submission.deadline.dividedBy(upstream.miningInfo.baseTarget).integerValue(BigNumber.ROUND_FLOOR);

      // Discard excluded accountIds
      if (upstream.upstreamConfig.excludedAccountIds && upstream.upstreamConfig.excludedAccountIds.some(accountId => accountId === submission.accountId)) {
        returnValues.push({
          result: 'success',
          deadline: adjustedDL.toNumber(),
        });
        continue;
      }

      if (this.proxyConfig.multiSubmit && i !== 0 && adjustedDL.toNumber() < this.discardMultiSubmitDLsBelow) {
        // Discard potential winning DLs for other upstreams
        continue;
      }

      const bestDLForAcc = upstream.deadlines[submission.accountId];

      // Do not submit worse DLs than already submitted
      if (bestDLForAcc && bestDLForAcc.isLessThanOrEqualTo(adjustedDL)) {
        returnValues.push({
          result: 'success',
          deadline: adjustedDL.toNumber(),
        });
        continue;
      }

      upstream.deadlines[submission.accountId] = adjustedDL;
      eventBus.publish('stats/current-round', upstream.fullUpstreamName, upstream.getCurrentRoundStats());

      const targetDLForAccountId = upstream.upstreamConfig.accountIdToTargetDL && upstream.upstreamConfig.accountIdToTargetDL[submission.accountId];
      const targetDL = upstream.dynamicTargetDeadline || targetDLForAccountId || upstream.upstreamConfig.targetDL;

      // DL too high to submit
      if (adjustedDL.isGreaterThan(targetDL)) {
        if (upstream.upstreamConfig.showAllDeadlines) {
          const deadlineColor = this.getDeadlineColor(adjustedDL) || upstream.deadlineColor;
          eventBus.publish('log/info', `${fullUpstreamNameLogs} | ${outputUtil.getString(minerId, miner.color || upstream.minerColor)} | ` +
            `account=${outputUtil.getString(submission.accountId, outputUtil.getAccountColor(submission.accountId, upstream))} | sent DL ${outputUtil.getString(this.getFormattedDeadline(adjustedDL), deadlineColor)}`);
        }
        returnValues.push({
          result: 'success',
          deadline: adjustedDL.toNumber(),
        });
        continue;
      }
      if (upstream.miningInfo.targetDeadline && adjustedDL.isGreaterThan(upstream.miningInfo.targetDeadline)) {
        if (upstream.upstreamConfig.showAllDeadlines) {
          const deadlineColor = this.getDeadlineColor(adjustedDL) || upstream.deadlineColor;
          eventBus.publish('log/info', `${fullUpstreamNameLogs} | ${outputUtil.getString(minerId, miner.color || upstream.minerColor)} | ` +
            `account=${outputUtil.getString(submission.accountId, outputUtil.getAccountColor(submission.accountId, upstream))} | sent DL ${outputUtil.getString(this.getFormattedDeadline(adjustedDL), deadlineColor)}`);
        }
        returnValues.push({
          result: 'success',
          deadline: adjustedDL.toNumber(),
        });
        continue;
      }

      const result = await upstream.submitNonce(submission, minerSoftware, options);
      const deadlineColor = this.getDeadlineColor(adjustedDL) || upstream.deadlineColor;
      const error = result.error || result.result.error;
      if (error) {
        eventBus.publish('log/error', `${fullUpstreamNameLogs} | ${outputUtil.getString(minerId, miner.color || upstream.minerColor)} | ` +
          `account=${outputUtil.getString(submission.accountId, outputUtil.getAccountColor(submission.accountId, upstream))} | Error: tried submitting DL ${outputUtil.getString(this.getFormattedDeadline(adjustedDL), deadlineColor)}, failed with error ` +
          `${JSON.stringify(error)}`);

        returnValues.push({
          error,
        });
        continue;
      }

      let realResult = result.result;
      if (!realResult) {
        // emulate response
        realResult = {
          result: 'success',
          deadline: adjustedDL.toNumber(),
        };
      }
      if (realResult.height && submission.height !== parseInt(realResult.height, 10)) {
        returnValues.push({
          error: {
            message: 'Submission is for a different round',
            code: 9,
          },
        });
        continue;
      }
      if (parseInt(realResult.deadline, 10) !== adjustedDL.toNumber()) {
        eventBus.publish('log/error', `${fullUpstreamNameLogs} | ${outputUtil.getString(minerId, miner.color || upstream.minerColor)} | ` +
          `account=${outputUtil.getString(submission.accountId, outputUtil.getAccountColor(submission.accountId, upstream))} | Error: tried submitting DL ${outputUtil.getString(this.getFormattedDeadline(adjustedDL), deadlineColor)}, ` +
          `but the received DL does not match: ${JSON.stringify(realResult)}`);
        if (realResult.height) {
          returnValues.push({
            error: {
              message: `DL verification failed, your plot file might be corrupt. AccountId: ${submission.accountId} | Nonce: ${submission.nonce}`,
              code: 10,
            },
          });
          continue;
        }
        returnValues.push(realResult);
        continue;
      }
      if (realResult.result === 'success') {
        eventBus.publish('log/info', `${fullUpstreamNameLogs} | ${outputUtil.getString(minerId, miner.color || upstream.minerColor)} | ` +
          `account=${outputUtil.getString(submission.accountId, outputUtil.getAccountColor(submission.accountId, upstream))} | submitted DL ${outputUtil.getString(this.getFormattedDeadline(adjustedDL), deadlineColor)}`);
      } else {
        const error = realResult.error || realResult;
        eventBus.publish('log/error', `${fullUpstreamNameLogs} | ${outputUtil.getString(minerId, miner.color || upstream.minerColor)} | ` +
          `account=${outputUtil.getString(submission.accountId, outputUtil.getAccountColor(submission.accountId, upstream))} | Error: tried submitting DL ${outputUtil.getString(this.getFormattedDeadline(adjustedDL), deadlineColor)}, failed with error ` +
          `${JSON.stringify(error)}`);
      }

      returnValues.push(realResult);
    }

    const errorReturn = returnValues.find(returnValue => returnValue.error);
    if (errorReturn) {
      return errorReturn;
    }
    return returnValues[0];
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
      color: this.proxyConfig.color,
      maxScanTime: this.maxScanTime,
      ...proxyStats,
      upstreamStats,
    };
  }
}

module.exports = Proxy;
