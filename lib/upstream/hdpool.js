const { HDPoolMiningApi } = require('hdpool-api');
const { hostname } = require('os');
const EventEmitter = require('events');
const database = require('../../models');
const eventBus = require('../event-bus');
const MiningInfo = require('../miningInfo');
const util = require('./util');
const version = require('../version');
const estimatedCapacityMixin = require('./estimated-capacity-mixin');
const statsMixin = require('./stats-mixin');

class HDPool extends statsMixin(estimatedCapacityMixin(EventEmitter)) {
  constructor(upstreamConfig, miners, proxyName) {
    super();
    this.fullUpstreamName = `${proxyName}/${upstreamConfig.name}`;
    this.fullUpstreamNameLogs = `${proxyName} | ${upstreamConfig.name}`;
    this.isBHD = true;
    this.upstreamConfig = upstreamConfig;
    this.historicalRoundsToKeep = upstreamConfig.historicalRoundsToKeep ? upstreamConfig.historicalRoundsToKeep : 720;
    this.defaultMinerName = `BHD-Burst-Proxy ${version}/${hostname()}`;
    this.miningInfo = {height: 0};
    this.deadlines = {};
    this.miners = miners;
    this.roundStart = new Date();
  }

  async init() {
    await super.init();

    const accountIds = this.getAccountIds();
    const accountIdsWithHandlerInfo = accountIds.map((accountId, i) => ({
      accountId,
      setupNewRoundHandler: i === 0,
    }));

    if (this.upstreamConfig.accountKey && !this.upstreamConfig.allAccountIdsConfigured) {
      if (accountIdsWithHandlerInfo.length > 0) {
        accountIdsWithHandlerInfo[0].setupNewRoundHandler = false;
      }
      await this.setupSession(null, true);
    }

    this.clients = {};
    await Promise.all(accountIdsWithHandlerInfo.map(async ({accountId, setupNewRoundHandler}, i) => {
      if (i !== 0) {
        await new Promise(resolve => setTimeout(resolve, 2 * 1000));
      }
      await this.setupSession(accountId, setupNewRoundHandler);
    }));
  }

  async setupSession(accountId = null, setupNewRoundHandler = false) {
    const accountKey = this.getAccountKeyForAccountId(accountId);
    const capacity = this.getCapacityForAccountId(accountId);
    const minerName = this.getMinerNameForAccountId(accountId);

    const client = new HDPoolMiningApi(accountKey, minerName, capacity || 1);

    if (accountId) {
      this.clients[accountId] = client;
    } else {
      this.client = client;
    }

    await client.init();
    client.subscribe('websocket/opened', () => eventBus.publish('log/debug', `${this.fullUpstreamNameLogs} | account=${accountId} | websocket opened`));
    client.subscribe('websocket/closed', () => eventBus.publish('log/debug', `${this.fullUpstreamNameLogs} | account=${accountId} | websocket closed`));

    if (!setupNewRoundHandler) {
      return;
    }

    client.onMiningInfo(this.onNewRound.bind(this));
    const miningInfo = await client.getMiningInfo();
    await this.onNewRound(miningInfo);
  }

  async onNewRound(para) {
    if (this.upstreamConfig.sendTargetDL) {
      para.targetDeadline = this.upstreamConfig.sendTargetDL;
    }
    const miningInfo = new MiningInfo(para.height, para.baseTarget, para.generationSignature, para.targetDeadline);
    // save some stats for later
    const lastBlockHeight = this.miningInfo.height;
    const lastBaseTarget = this.miningInfo.baseTarget;
    const lastNetDiff = this.miningInfo.netDiff;
    const bestDL = this.getBestDL();
    const bestDLSubmitted = bestDL ? (bestDL.isLessThanOrEqualTo(this.upstreamConfig.targetDL)) ? bestDL : null : null;
    const accountIds = Object.keys(this.deadlines);

    this.roundStart = new Date();
    this.miningInfo = miningInfo;
    this.emit('new-round', miningInfo);
    this.deadlines = {};
    eventBus.publish('stats/current-round', this.fullUpstreamName, this.getCurrentRoundStats());
    let newBlockLine = `${this.fullUpstreamNameLogs} | New block ${miningInfo.height}, baseTarget ${miningInfo.baseTarget}, netDiff ${miningInfo.netDiff.toFixed(0)} TB`;
    if (miningInfo.targetDeadline) {
      newBlockLine += `, targetDeadline: ${miningInfo.targetDeadline}`;
    }
    eventBus.publish('log/info', newBlockLine);

    if (lastBlockHeight !== 0) {
      // Add historical, but wait some time till the wallet has caught up
      await new Promise(resolve => setTimeout(resolve, 7 * 1000));
      const lastBlockWinner = await this.getBlockWinnerAccountId(lastBlockHeight);
      const roundWon = accountIds.some(accountId => accountId === lastBlockWinner);

      await database().round.create({
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
    const toDestroy = await database().round.findAll({
      where: {
        upstream: this.fullUpstreamName,
      },
      order: [
        ['blockHeight', 'DESC'],
      ],
      offset: this.historicalRoundsToKeep,
    });
    await Promise.all(toDestroy.map(row => row.destroy()));

     eventBus.publish('stats/historical', this.fullUpstreamName, await this.getHistoricalStats());
  }

  submitNonce(submission) {
    const client = this.getClientForAccountId(submission.accountId);
    client.submitNonce(
      submission.accountId,
      submission.height,
      submission.nonce.toString(),
      submission.deadline.toNumber()
    );
    return {};
  }

  getClientForAccountId(accountId) {
    if (!accountId) {
      return this.client;
    }

    if (this.clients[accountId]) {
      return this.clients[accountId];
    }

    return this.client;
  }

  getAccountKeyForAccountId(accountId) {
    if (!accountId) {
      return this.upstreamConfig.accountKey;
    }

    if (this.upstreamConfig.accountKeyForAccountId && this.upstreamConfig.accountKeyForAccountId[accountId]) {
      return this.upstreamConfig.accountKeyForAccountId[accountId];
    }

    return this.upstreamConfig.accountKey;
  }

  getCapacityForAccountId(accountId) {
    if (!accountId) {
      return this.totalCapacity;
    }

    if (this.upstreamConfig.capacityForAccountId && this.upstreamConfig.capacityForAccountId[accountId]) {
      return this.upstreamConfig.capacityForAccountId[accountId];
    }

    return this.totalCapacity;
  }

  getMinerNameForAccountId(accountId) {
    if (!accountId) {
      return this.upstreamConfig.minerName || this.defaultMinerName;
    }

    if (this.upstreamConfig.minerNameForAccountId && this.upstreamConfig.minerNameForAccountId[accountId]) {
      return this.upstreamConfig.minerNameForAccountId[accountId];
    }

    return this.upstreamConfig.minerName || this.defaultMinerName;
  }

  getAccountIds() {
    let accountIds = [];
    if (this.upstreamConfig.accountKeyForAccountId) {
      accountIds = accountIds.concat(Object.keys(this.upstreamConfig.accountKeyForAccountId));
    }
    if (this.upstreamConfig.capacityForAccountId) {
      accountIds = accountIds.concat(Object.keys(this.upstreamConfig.capacityForAccountId));
    }
    if (this.upstreamConfig.minerNameForAccountId) {
      accountIds = accountIds.concat(Object.keys(this.upstreamConfig.minerNameForAccountId));
    }

    return [...new Set(accountIds)].sort();
  }

  async getBlockWinnerAccountId(height) {
    if (!this.upstreamConfig.walletUrl) {
      return -1;
    }

    return util.getBlockWinnerAccountId(this.upstreamConfig.walletUrl, true, height);
  }

  getMiningInfo() {
    return this.miningInfo.toObject();
  }

  recalculateTotalCapacity() {
    super.recalculateTotalCapacity();
    Object.keys(this.clients).map(accountId => {
      this.clients[accountId].capacity = this.getCapacityForAccountId(accountId);
    });
    if (this.client) {
      this.client.capacity = this.getCapacityForAccountId();
    }
  }
}

module.exports = HDPool;