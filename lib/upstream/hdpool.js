const ReconnectingWebSocket = require('reconnecting-websocket');
const WebSocket = require('ws');
const { hostname } = require('os');
const database = require('../../models');
const eventBus = require('../event-bus');
const MiningInfo = require('../miningInfo');
const util = require('./util');
const version = require('../version');

class HDPool {
  static getMiningInfoData() {
    return {
      cmd: 'mining_info',
      para: {},
    };
  }

  constructor(upstreamConfig) {
    this.websocketEndpoint = 'wss://hdminer.hdpool.com';
    this.hdproxyVersion = '20181212';
    this.heartbeatInterval = 5 * 1000;
    this.isBHD = true;
    this.upstreamConfig = upstreamConfig;
    this.historicalRoundsToKeep = upstreamConfig.historicalRoundsToKeep ? upstreamConfig.historicalRoundsToKeep : 720;
    this.defaultMinerName = `BHD-Burst-Proxy ${version}/${hostname()}`;
    this.miningInfo = {height: 0};
    this.deadlines = {};
    this.miners = {};
    this.roundStart = new Date();
  }

  async init() {
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
            const miningInfoInit = new MiningInfo(data.para.height, data.para.baseTarget, data.para.generationSignature, data.para.targetDeadline);
            await this.onNewRound(miningInfoInit);
            resolve();
            break;
          case 'poolmgr.mining_info':
            const miningInfo = new MiningInfo(data.para.height, data.para.baseTarget, data.para.generationSignature, data.para.targetDeadline);
            await this.onNewRound(miningInfo);
            break;
          default:
            console.log(`${this.upstreamConfig.name} | unknown command ${data.cmd} with data: ${JSON.stringify(data)}. Please message this info to the creator.`);
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

  async onNewRound(miningInfo) {
    // save some stats for later
    const lastBlockHeight = this.miningInfo.height;
    const lastNetDiff = this.miningInfo.netDiff;
    const bestDL = util.getBestDL(this.deadlines);
    const bestDLSubmitted = bestDL ? (bestDL.isLessThanOrEqualTo(this.upstreamConfig.targetDL)) ? bestDL : null : null;
    const accountIds = Object.keys(this.deadlines);

    this.roundStart = new Date();
    this.miningInfo = miningInfo;
    this.deadlines = {};
    let newBlockLine = `${this.upstreamConfig.name} | New block ${miningInfo.height}, baseTarget ${miningInfo.baseTarget}, netDiff ${miningInfo.netDiff.toFixed(0)} TB`;
    if (miningInfo.targetDeadline) {
      newBlockLine += `, targetDeadline: ${miningInfo.targetDeadline}`;
    }
    console.log(`${new Date().toISOString()} | ${newBlockLine}`);

    // Remove stale miners
    Object.keys(this.miners).forEach(key => {
      if (this.miners[key].lastBlockActive > miningInfo.height - 10) {
        return;
      }
      delete this.miners[key];
    });

    if (lastBlockHeight !== 0) {
      // Add historical, but wait some time till the wallet has caught up
      await new Promise(resolve => setTimeout(resolve, 7 * 1000));
      const lastBlockWinner = await this.getBlockWinnerAccountId(lastBlockHeight);
      const roundWon = accountIds.some(accountId => accountId === lastBlockWinner);

      await database().round.create({
        upstream: this.upstreamConfig.name,
        blockHeight: lastBlockHeight,
        netDiff: lastNetDiff,
        bestDL: bestDL ? bestDL.toString() : null,
        bestDLSubmitted: bestDLSubmitted ? bestDLSubmitted.toString() : null,
        roundWon,
      });
    }

    // Remove old historical
    await database().round.destroy({
      where: {
        upstream: this.upstreamConfig.name,
        blockHeight: {
          [database().Op.lt]: this.miningInfo.height - this.historicalRoundsToKeep,
        },
      },
    });

    eventBus.publish('stats/new');
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

  submitNonce(minerRound) {
    this.client.send(JSON.stringify({
      cmd: 'poolmgr.submit_nonce',
      para: {
        account_key: this.upstreamConfig.accountKey,
        capacity: this.getTotalCapacity(),
        miner_mark: '',
        miner_name: this.upstreamConfig.minerName || this.defaultMinerName,
        submit: [{
          accountId: minerRound.accountId,
          height: minerRound.height,
          nonce: minerRound.nonce.toString(),
          deadline: minerRound.deadline.toNumber(),
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

  getBestDL() {
    return util.getBestDL(this.deadlines);
  }

  getTotalCapacity() {
    if (this.upstreamConfig.capacity !== undefined) {
      return this.upstreamConfig.capacity;
    }

    return util.convertCapacityToGB(util.getTotalMinerCapacity(this.miners));
  }
}

module.exports = HDPool;