const { HDPoolMiningApi } = require('hdpool-api');
const { hostname } = require('os');
const BaseUpstream = require('./base');
const database = require('../../models');
const eventBus = require('../services/event-bus');
const MiningInfo = require('../miningInfo');
const util = require('./util');
const version = require('../version');
const outputUtil = require('../output-util');

class HDPool extends BaseUpstream {
  constructor(upstreamConfig, miners, proxyConfig) {
    super();
    this.fullUpstreamName = `${proxyConfig.name}/${upstreamConfig.name}`;
    this.fullUpstreamNameLogs = outputUtil.getFullUpstreamNameLogs(proxyConfig, upstreamConfig);
    this.isBHD = true;
    this.upstreamConfig = upstreamConfig;
    this.historicalRoundsToKeep = upstreamConfig.historicalRoundsToKeep ? upstreamConfig.historicalRoundsToKeep : 720;
    this.defaultMinerName = `BHD-Burst-Proxy ${version}/${hostname()}`;
    this.miningInfo = {height: 0, toObject: () => ({height: 0})};
    this.deadlines = {};
    this.miners = miners;
    this.roundStart = new Date();
  }

  async init() {
    await super.init();

    this.clients = {};

    const accounts = Array.from(this.getAccounts().values());
    await Promise.all(accounts.map((account, index) => {
      const doHandlerSetup = index === 0;

      return this.setupMinersForAccount(account, doHandlerSetup);
    }));
  }

  async setupMinersForAccount(account, doHandlerSetup) {
    for (let [minerName, miner] of account.miners) {
      const client = new HDPoolMiningApi(account.accountKey, minerName, miner.capacity || 1, miner.useEcoPool);
      client.subscribe('debug', (message) => {
        eventBus.publish('log/debug', `${this.fullUpstreamNameLogs} | miner=${outputUtil.getString(minerName, this.minerColor)} | ${message}`);
      });

      if (miner.accountIds.length > 0) {
        miner.accountIds.forEach(accountId => this.clients[accountId] = client);
      } else {
        this.client = client;
      }

      await client.init();
      client.subscribe('websocket/opened', () => {
        this.connected = true;
        eventBus.publish('log/debug', `${this.fullUpstreamNameLogs} | miner=${outputUtil.getString(minerName, this.minerColor)} | websocket opened`);
      });
      client.subscribe('websocket/closed', () => {
        this.connected = false;
        eventBus.publish('log/debug', `${this.fullUpstreamNameLogs} | miner=${outputUtil.getString(minerName, this.minerColor)} | websocket closed`);
      });
      client.subscribe('websocket/broken', () => {
        this.connected = false;
        eventBus.publish('log/debug', `${this.fullUpstreamNameLogs} | miner=${outputUtil.getString(minerName, this.minerColor)} | websocket closed`);
      });

      if (!doHandlerSetup) {
        continue;
      }

      // Ensure miningInfo after reconnects
      client.subscribe('websocket/opened', async () => {
        const miningInfo = await client.getMiningInfo();
        await this.onNewRound(miningInfo);
      });

      client.onMiningInfo(this.onNewRound.bind(this));
      const miningInfo = await client.getMiningInfo();
      await this.onNewRound(miningInfo);
      doHandlerSetup = false;
    }
  }

  async onNewRound(para) {
    if (this.upstreamConfig.sendTargetDL) {
      para.targetDeadline = this.upstreamConfig.sendTargetDL;
    }
    const miningInfo = new MiningInfo(para.height, para.baseTarget, para.generationSignature, para.targetDeadline);

    const duplicate = miningInfo.height === this.miningInfo.height && miningInfo.baseTarget === this.miningInfo.baseTarget;
    if (duplicate) {
      return;
    }

    // save some stats for later
    const isFork = miningInfo.height === this.miningInfo.height && miningInfo.baseTarget !== this.miningInfo.baseTarget;
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
    let newBlockLine = `${this.fullUpstreamNameLogs} | ${outputUtil.getString(`New block ${outputUtil.getString(miningInfo.height, this.newBlockColor)}, baseTarget ${outputUtil.getString(miningInfo.baseTarget, this.newBlockBaseTargetColor)}, netDiff ${outputUtil.getString(miningInfo.netDiff.toFixed(0) + ' TB', this.newBlockNetDiffColor)}`, this.newBlockLineColor)}`;
    if (miningInfo.targetDeadline) {
      newBlockLine += outputUtil.getString(`, targetDeadline: ${miningInfo.targetDeadline}`, this.newBlockLineColor);
    }
    eventBus.publish('log/info', newBlockLine);

    if (isFork) {
      return;
    }

    if (lastBlockHeight !== 0) {
      // Add historical, but wait some time till the wallet has caught up
      await new Promise(resolve => setTimeout(resolve, 7 * 1000));
      const lastBlockWinner = await this.getBlockWinnerAccountId(lastBlockHeight);
      const roundWon = lastBlockWinner === null ? null : accountIds.some(accountId => accountId === lastBlockWinner);

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
    if (!client) {
      eventBus.publish('log/error', `${this.fullUpstreamNameLogs} | Error: no client configured for accountId ${outputUtil.getString(submission.accountId, this.accountColor)}`);
      return {};
    }
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

  getUseEcoPoolForAccountId(accountId) {
    if (!accountId) {
      return this.upstreamConfig.useEcoPool === true;
    }

    if (this.upstreamConfig.useEcoPoolForAccountId && this.upstreamConfig.useEcoPoolForAccountId[accountId] !== undefined) {
      return this.upstreamConfig.useEcoPoolForAccountId[accountId];
    }

    return this.upstreamConfig.useEcoPool === true;
  }

  getAccounts() {
    this.recalculateTotalCapacity();
    const accounts = new Map();
    if (this.upstreamConfig.minerNameForAccountId) {
      Object.keys(this.upstreamConfig.minerNameForAccountId).forEach(accountId => {
        const minerName = this.upstreamConfig.minerNameForAccountId[accountId];
        const accountKey = this.getAccountKeyForAccountId(accountId);
        const capacity = this.getCapacityForAccountId(accountId);
        const useEcoPool = this.getUseEcoPoolForAccountId(accountId);
        let account = {
          miners: new Map(),
          accountKey,
        };
        if (accounts.get(accountKey)) {
          account = accounts.get(accountKey);
        }
        let miner = account.miners.get(minerName);
        if (!miner) {
          miner = {
            capacity: 0,
            accountIds: [],
            useEcoPool,
          };
        }
        miner.capacity += capacity;
        miner.accountIds.push(accountId);
        account.miners.set(minerName, miner);
        accounts.set(accountKey, account);
      });
    }
    if (this.upstreamConfig.accountKey && !this.upstreamConfig.allAccountIdsConfigured) {
      let minerName = this.upstreamConfig.minerName || this.defaultMinerName;
      const accountKey = this.upstreamConfig.accountKey;
      const capacity = this.totalCapacity;
      const useEcoPool = this.getUseEcoPoolForAccountId();
      let account = {
        miners: new Map(),
        accountKey,
      };
      if (accounts.get(accountKey)) {
        account = accounts.get(accountKey);
      }
      const miner = {
        capacity,
        accountIds: [],
        useEcoPool,
      };
      // Ensure default miner name is unique
      while (account.miners.get(minerName)) {
        minerName += '-1';
      }
      account.miners.set(minerName, miner);
      accounts.set(accountKey, account);
    }

    return accounts;
  }

  async getBlockWinnerAccountId(height) {
    if (!this.upstreamConfig.walletUrl) {
      return null;
    }

    return util.getBlockWinnerAccountId(this.upstreamConfig.walletUrl, true, height);
  }

  getMiningInfo() {
    return this.miningInfo.toObject();
  }

  recalculateTotalCapacity() {
    super.recalculateTotalCapacity();
    if (this.client) {
      this.client.capacity = this.totalCapacity;
    }
  }
}

module.exports = HDPool;