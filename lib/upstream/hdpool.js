const ReconnectingWebSocket = require('reconnecting-websocket');
const WebSocket = require('ws');
const { hostname } = require('os');
const EventEmitter = require('events');
const moment = require('moment');
const database = require('../../models');
const eventBus = require('../event-bus');
const MiningInfo = require('../miningInfo');
const util = require('./util');
const version = require('../version');
const estimatedCapacityMixin = require('./estimated-capacity-mixin');
const statsMixin = require('./stats-mixin');

class HDPool extends statsMixin(estimatedCapacityMixin(EventEmitter)) {
  static getMiningInfoData() {
    return {
      cmd: 'mining_info',
      para: {},
    };
  }

  constructor(upstreamConfig, miners, proxyName) {
    super();
    this.fullUpstreamName = `${proxyName}/${upstreamConfig.name}`;
    this.fullUpstreamNameLogs = `${proxyName} | ${upstreamConfig.name}`;
    this.websocketEndpoint = 'wss://hdminer.hdpool.com';
    this.hdproxyVersion = '20181212';
    this.heartbeatInterval = 5 * 1000;
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
    const client = new ReconnectingWebSocket(this.websocketEndpoint, [], {
      WebSocket,
    });

    if (accountId) {
      this.clients[accountId] = client;
    } else {
      this.client = client;
    }

    const hasMiningInfo = new Promise(resolve => {
      client.addEventListener('message', async (msg) => {
        const data = JSON.parse(msg.data);
        switch (data.cmd) {
          case 'poolmgr.heartbeat':
            // pool ack, ignore for now
            break;
          case 'mining_info':
            if (setupNewRoundHandler) {
              await this.onNewRound(data.para);
            }
            resolve();
            break;
          case 'poolmgr.mining_info':
            if (setupNewRoundHandler) {
              await this.onNewRound(data.para);
            }
            break;
          default:
            eventBus.publish('log/info', `${this.fullUpstreamNameLogs} | unknown command ${data.cmd} with data: ${JSON.stringify(data)}. Please message this info to the creator of this software.`);
        }
      });
    });

    await new Promise(resolve => {
      client.addEventListener('open', resolve, {once: true});
    });

    // needed?
    client.send(JSON.stringify(this.getHeartBeatData(accountId)));
    setInterval(() => {
      client.send(JSON.stringify(this.getHeartBeatData(accountId)));
    }, this.heartbeatInterval);

    // get initial miningInfo
    client.send(JSON.stringify(HDPool.getMiningInfoData()));

    await hasMiningInfo;
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

  getHeartBeatData(accountId = null) {
    const accountKey = this.getAccountKeyForAccountId(accountId);
    const capacity = this.getCapacityForAccountId(accountId);
    const minerName = this.getMinerNameForAccountId(accountId);

    return {
      cmd: 'poolmgr.heartbeat',
      para: {
        account_key: accountKey,
        miner_name: minerName,
        miner_mark: `${hostname()}.hdproxy.exe.${this.hdproxyVersion}`,
        capacity: capacity,
      },
    };
  }

  submitNonce(submission) {
    const client = this.getClientForAccountId(submission.accountId);
    const accountKey = this.getAccountKeyForAccountId(submission.accountId);
    const capacity = this.getCapacityForAccountId(submission.accountId);
    const minerName = this.getMinerNameForAccountId(submission.accountId);

    client.send(JSON.stringify({
      cmd: 'poolmgr.submit_nonce',
      para: {
        account_key: accountKey,
        capacity,
        miner_mark: '',
        miner_name: minerName,
        submit: [{
          accountId: submission.accountId,
          height: submission.height,
          nonce: submission.nonce.toString(),
          deadline: submission.deadline.toNumber(),
          ts: (new Date()).getTime() / 1000,
        }],
      },
    }));
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
      return this.getTotalCapacity();
    }

    if (this.upstreamConfig.capacityForAccountId && this.upstreamConfig.capacityForAccountId[accountId]) {
      return this.upstreamConfig.capacityForAccountId[accountId];
    }

    return this.getTotalCapacity();
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

  getTotalCapacity() {
    if (this.upstreamConfig.capacity !== undefined) {
      return this.upstreamConfig.capacity;
    }

    return util.convertCapacityToGB(util.getTotalMinerCapacity(this.miners));
  }
}

module.exports = HDPool;