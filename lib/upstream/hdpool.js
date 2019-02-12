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

    this.client = new ReconnectingWebSocket(this.websocketEndpoint, [], {
      WebSocket,
    });

    const hasMiningInfo = new Promise(resolve => {
      this.client.addEventListener('message', async (msg) => {
        const data = JSON.parse(msg.data);
        switch (data.cmd) {
          case 'poolmgr.heartbeat':
            // pool ack, ignore for now
            break;
          case 'mining_info':
            await this.onNewRound(data.para);
            resolve();
            break;
          case 'poolmgr.mining_info':
            await this.onNewRound(data.para);
            break;
          default:
            eventBus.publish('log/info', `${this.fullUpstreamNameLogs} | unknown command ${data.cmd} with data: ${JSON.stringify(data)}. Please message this info to the creator of this software.`);
        }
      });
    });

    await new Promise(resolve => {
      this.client.addEventListener('open', resolve, {once: true});
    });

    // needed?
    this.client.send(JSON.stringify(this.getHeartBeatData()));
    setInterval(() => {
      this.client.send(JSON.stringify(this.getHeartBeatData()));
    }, this.heartbeatInterval);

    // get initial miningInfo
    this.client.send(JSON.stringify(HDPool.getMiningInfoData()));

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

    eventBus.publish('stats/new');
    eventBus.publish('stats/historical', this.fullUpstreamName, await this.getHistoricalStats());
  }

  getHeartBeatData() {
    return {
      cmd: 'poolmgr.heartbeat',
      para: {
        account_key: this.upstreamConfig.accountKey,
        miner_name: this.upstreamConfig.minerName || this.defaultMinerName,
        miner_mark: `${hostname()}.hdproxy.exe.${this.hdproxyVersion}`,
        capacity: this.getTotalCapacity(),
      },
    };
  }

  submitNonce(submission) {
    this.client.send(JSON.stringify({
      cmd: 'poolmgr.submit_nonce',
      para: {
        account_key: this.upstreamConfig.accountKey,
        capacity: this.getTotalCapacity(),
        miner_mark: '',
        miner_name: this.upstreamConfig.minerName || this.defaultMinerName,
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