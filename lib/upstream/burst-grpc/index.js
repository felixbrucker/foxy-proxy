const grpc = require('grpc');
const protoLoader = require('@grpc/proto-loader');
const { hostname } = require('os');
const EventEmitter = require('events');
const moment = require('moment');
const database = require('../../../models');
const eventBus = require('../../event-bus');
const MiningInfo = require('../../miningInfo');
const util = require('../util');
const version = require('../../version');
const estimatedCapacityMixin = require('../estimated-capacity-mixin');

class BurstGrpc extends estimatedCapacityMixin(EventEmitter) {

  constructor(upstreamConfig, miners, proxyName) {
    super();
    this.fullUpstreamName = `${proxyName}/${upstreamConfig.name}`;
    this.fullUpstreamNameLogs = `${proxyName} | ${upstreamConfig.name}`;
    this.isBHD = false;
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

    const packageDefinition = protoLoader.loadSync(`${__dirname}/brs.proto`, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true
    });
    const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);

    this.client = new protoDescriptor.BRS(this.upstreamConfig.url, grpc.credentials.createInsecure());
    const miningInfoEvents = this.client.getMiningInfo();
    miningInfoEvents.on('data', this.onNewRound.bind(this));
    miningInfoEvents.on('end', () => {
      console.log();
    });
    miningInfoEvents.on('error', (e) => {
      console.log();
    });
    miningInfoEvents.on('status', (status) => {
      console.log();
    });

    // const hasMiningInfo = new Promise(resolve => {
    //   this.client.addEventListener('message', async (msg) => {
    //     const data = JSON.parse(msg.data);
    //     switch (data.cmd) {
    //       case 'poolmgr.heartbeat':
    //         // pool ack, ignore for now
    //         break;
    //       case 'mining_info':
    //         await this.onNewRound(data.para);
    //         resolve();
    //         break;
    //       case 'poolmgr.mining_info':
    //         await this.onNewRound(data.para);
    //         break;
    //       default:
    //         console.log(`${moment().format('YYYY-MM-DD HH:mm:ss.SSS')} | ${this.fullUpstreamNameLogs} | unknown command ${data.cmd} with data: ${JSON.stringify(data)}. Please message this info to the creator of this software.`);
    //     }
    //   });
    // });
    //
    // await hasMiningInfo;
  }

  async onNewRound(miningInfoGrpc) {
    if (this.upstreamConfig.sendTargetDL) {
      miningInfoGrpc.targetDeadline = this.upstreamConfig.sendTargetDL;
    }
    const miningInfo = new MiningInfo(
      miningInfoGrpc.height,
      miningInfoGrpc.baseTarget,
      miningInfoGrpc.generationSignature,
      miningInfoGrpc.targetDeadline
    );
    // save some stats for later
    const lastBlockHeight = this.miningInfo.height;
    const lastBaseTarget = this.miningInfo.baseTarget;
    const lastNetDiff = this.miningInfo.netDiff;
    const bestDL = util.getBestDL(this.deadlines);
    const bestDLSubmitted = bestDL ? (bestDL.isLessThanOrEqualTo(this.upstreamConfig.targetDL)) ? bestDL : null : null;
    const accountIds = Object.keys(this.deadlines);

    this.roundStart = new Date();
    this.miningInfo = miningInfo;
    this.emit('new-round', miningInfo);
    this.deadlines = {};
    let newBlockLine = `${this.fullUpstreamNameLogs} | New block ${miningInfo.height}, baseTarget ${miningInfo.baseTarget}, netDiff ${miningInfo.netDiff.toFixed(0)} TB`;
    if (miningInfo.targetDeadline) {
      newBlockLine += `, targetDeadline: ${miningInfo.targetDeadline}`;
    }
    console.log(`${moment().format('YYYY-MM-DD HH:mm:ss.SSS')} | ${newBlockLine}`);

    if (lastBlockHeight !== 0) {
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
  }

  async submitNonce(submission) {
    const passphrase = this.upstreamConfig.passphrases && this.upstreamConfig.passphrases[submission.accountId] || this.upstreamConfig.passphrase;
    const submitNonceResponse = await new Promise((resolve, reject) => {
      this.client.submitNonce({
        secretPhrase: passphrase,
        nonce: submission.nonce.toString(),
        account: submission.accountId,
        blockHeight: submission.height,
      }, (err, submitNonceResponse) => {
        if (err) {
          return reject(err);
        }
        resolve(submitNonceResponse);
      });
    });
    console.log();

    return submitNonceResponse;
  }

  async getBlockWinnerAccountId(height) {
    if (!this.upstreamConfig.walletUrl) {
      return -1;
    }

    return util.getBlockWinnerAccountId(this.upstreamConfig.walletUrl, false, height);
  }

  getMiningInfo() {
    return this.miningInfo.toObject();
  }

  getBestDL() {
    return util.getBestDL(this.deadlines);
  }

  async getStats() {
    const estimatedCapacityInTB = await this.getEstimatedCapacity();

    const bestDL = this.getBestDL();

    const historicalRounds = await database().round.findAll({
      where: {
        upstream: this.fullUpstreamName,
      },
      order: [
        ['blockHeight', 'DESC'],
      ],
    });

    return {
      name: this.upstreamConfig.name,
      fullName: this.fullUpstreamName,
      isBHD: this.isBHD,
      blockNumber: this.miningInfo.height,
      netDiff: this.miningInfo.netDiff,
      roundStart: this.roundStart,
      bestDL: bestDL ? bestDL.toString() : null,
      estimatedCapacityInTB,
      roundsWon: historicalRounds.filter(round => round.roundWon).length,
      roundsSubmitted: historicalRounds.filter(round => round.bestDLSubmitted).length,
      roundsWithDLs: historicalRounds.filter(round => round.bestDL).length,
      totalRounds: historicalRounds.length,
    };
  }
}

module.exports = BurstGrpc;