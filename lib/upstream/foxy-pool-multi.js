const Base = require('./base');
const foxyPoolGateway = require('../services/foxy-pool-gateway');

const { hostname } = require('os');
const database = require('../../models');
const eventBus = require('../services/event-bus');
const MiningInfo = require('../miningInfo');
const util = require('./util');
const version = require('../version');
const outputUtil = require('../output-util');
const persistingService = require('../services/persisting-service');

class FoxyPoolMulti extends Base {
  constructor(upstreamConfig, miners, proxyConfig) {
    super();
    this.proxyConfig = proxyConfig;
    this.fullUpstreamName = `${proxyConfig.name}/${upstreamConfig.name}`;
    this.fullUpstreamNameLogs = outputUtil.getFullUpstreamNameLogs(proxyConfig, upstreamConfig);
    this.isBHD = upstreamConfig.isBHD;
    this.upstreamConfig = upstreamConfig;
    this.upstreamConfig.mode = 'pool';
    this.historicalRoundsToKeep = this.upstreamConfig.historicalRoundsToKeep || (this.isBHD ? 288 : 360) * 2;
    this.userAgent = `Foxy-Proxy ${version}`;
    this.miningInfo = {height: 0, toObject: () => ({height: 0})};
    this.deadlines = {};
    this.miners = miners;
    this.roundStart = new Date();
    this.accountName = this.upstreamConfig.accountName || this.upstreamConfig.minerAlias || this.upstreamConfig.accountAlias;
    if (this.upstreamConfig.targetDL === undefined) {
      this.upstreamConfig.targetDL = 31536000;
    }
  }

  async init() {
    await super.init();
    this.coin = this.upstreamConfig.coin.toUpperCase();
    this.connected = false;

    foxyPoolGateway.onConnectionStateChange(() => {
      this.connected = foxyPoolGateway.connected;
    });
    foxyPoolGateway.onNewMiningInfo(this.coin, this.onNewMiningInfo.bind(this));

    const miningInfo = await foxyPoolGateway.getMiningInfo(this.coin);
    await this.onNewMiningInfo(miningInfo);
  }

  async onNewMiningInfo(para) {
    if (this.upstreamConfig.sendTargetDL) {
      para.targetDeadline = this.upstreamConfig.sendTargetDL;
    }
    const miningInfo = new MiningInfo(para.height, para.baseTarget, para.generationSignature, para.targetDeadline);
    if (this.miningInfo && this.miningInfo.height === miningInfo.height && this.miningInfo.baseTarget === miningInfo.baseTarget) {
      return;
    }

    if (this.useSubmitProbability) {
      this.updateDynamicTargetDL(miningInfo);
    }

    // save some stats for later
    const isFork = miningInfo.height === this.miningInfo.height && miningInfo.baseTarget !== this.miningInfo.baseTarget;
    const lastBlockHeight = this.miningInfo.height;
    const lastBaseTarget = this.miningInfo.baseTarget;
    const lastNetDiff = this.miningInfo.netDiff;
    const bestDL = this.getBestDL();
    let bestDLSubmitted = null;
    let targetDeadline = this.dynamicTargetDeadline || this.miningInfo.targetDeadline || Number.MAX_SAFE_INTEGER;
    if (bestDL && bestDL.isLessThanOrEqualTo(targetDeadline)) {
      bestDLSubmitted = bestDL;
    }
    const accountIds = Object.keys(this.deadlines);

    this.roundStart = new Date();
    this.miningInfo = miningInfo;
    this.emit('new-round', miningInfo);
    this.deadlines = {};
    eventBus.publish('stats/current-round', this.fullUpstreamName, this.getCurrentRoundStats());
    let newBlockLine = `${this.fullUpstreamNameLogs} | ${outputUtil.getString(`New block ${outputUtil.getString(miningInfo.height, this.newBlockColor)}, baseTarget ${outputUtil.getString(miningInfo.baseTarget, this.newBlockBaseTargetColor)}, netDiff ${outputUtil.getString(miningInfo.netDiffFormatted, this.newBlockNetDiffColor)}`, this.newBlockLineColor)}`;
    if (miningInfo.targetDeadline) {
      newBlockLine += outputUtil.getString(`, targetDeadline: ${outputUtil.getString(miningInfo.targetDeadline, this.newBlockTargetDeadlineColor)}`, this.newBlockLineColor);
    }
    eventBus.publish('log/info', newBlockLine);

    if (isFork) {
      return;
    }

    if (lastBlockHeight) {
      // Add historical, but wait some time till the wallet has caught up
      await new Promise(resolve => setTimeout(resolve, 7 * 1000));
      const lastBlockWinner = await this.getBlockWinnerAccountId(lastBlockHeight);
      const roundWon = lastBlockWinner === null ? null : accountIds.some(accountId => accountId === lastBlockWinner);

      await persistingService.createOrUpdateRound({
        upstream: this.fullUpstreamName,
        blockHeight: lastBlockHeight,
        baseTarget: lastBaseTarget,
        netDiff: lastNetDiff,
        bestDL: bestDL ? bestDL.toString() : null,
        bestDLSubmitted: bestDLSubmitted ? bestDLSubmitted.toString() : null,
        roundWon,
      });
    }

    // Remove old historical
    await persistingService.removeOldRounds({
      upstream: this.fullUpstreamName,
      roundsToKeep: this.historicalRoundsToKeep,
    });

    eventBus.publish('stats/historical', this.fullUpstreamName, await this.getHistoricalStats());
  }

  async submitNonce(submission, minerSoftware, options) {
    let minerSoftwareName = this.userAgent;
    if (this.upstreamConfig.sendMiningSoftwareName) {
      minerSoftwareName += ` | ${minerSoftware}`;
    }
    let minerName = this.upstreamConfig.minerName || hostname();
    let capacity = this.totalCapacity;
    if (this.upstreamConfig.minerPassthrough) {
      if (options.capacity) {
        capacity = options.capacity;
      }
      if (options.minerName) {
        minerName = options.minerName;
      }
    }
    const optionsToSubmit = {
      minerName,
      userAgent: minerSoftwareName,
      capacity,
      payoutAddress: this.upstreamConfig.payoutAddress || this.upstreamConfig.accountKey,
      accountName: this.accountName || options.accountName || null,
      distributionRatio: options.distributionRatio || this.upstreamConfig.distributionRatio || null,
    };
    const result = await foxyPoolGateway.submitNonce(this.coin, submission.toObject(), optionsToSubmit);

    return {
      error: null,
      result,
    };
  }

  async getBlockWinnerAccountId(height) {
    if (!this.upstreamConfig.walletUrl) {
      return null;
    }

    return util.getBlockWinnerAccountId(this.upstreamConfig.walletUrl, this.isBHD, height, this.upstreamConfig.customEndpoint);
  }

  getMiningInfo() {
    return this.miningInfo.toObject();
  }
}

module.exports = FoxyPoolMulti;
