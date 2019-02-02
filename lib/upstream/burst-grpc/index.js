const BigNumber = require('bignumber.js');
const EventEmitter = require('events');
const grpc = require('grpc');
const moment = require('moment');
const protoLoader = require('@grpc/proto-loader');
const database = require('../../../models');
const eventBus = require('../../event-bus');
const MiningInfo = require('../../miningInfo');
const util = require('../util');
const estimatedCapacityMixin = require('../estimated-capacity-mixin');

class BurstGrpc extends estimatedCapacityMixin(EventEmitter) {

  constructor(upstreamConfig, miners, proxyName) {
    super();
    this.fullUpstreamName = `${proxyName}/${upstreamConfig.name}`;
    this.fullUpstreamNameLogs = `${proxyName} | ${upstreamConfig.name}`;
    this.isBHD = false;
    this.upstreamConfig = upstreamConfig;
    this.historicalRoundsToKeep = upstreamConfig.historicalRoundsToKeep ? upstreamConfig.historicalRoundsToKeep : 720;
    this.miningInfo = {height: 0};
    this.deadlines = {};
    this.roundStart = new Date();
  }

  async init() {
    await super.init();

    const packageDefinition = protoLoader.loadSync(`${__dirname}/brs.proto`, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });
    const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);

    this.client = new protoDescriptor.BRS(this.upstreamConfig.url, grpc.credentials.createInsecure());

    this.startMiningInfoRetrieval();
  }

  async startMiningInfoRetrieval() {
    // endless loop to catch connection issues and trigger a reconnect
    while(true) {
      await new Promise(resolve => {
        const miningInfoEvents = this.client.getMiningInfo();
        miningInfoEvents.on('data', this.onNewRound.bind(this));
        miningInfoEvents.once('end', resolve);
        miningInfoEvents.once('error', (err) => {
          console.error(`${moment().format('YYYY-MM-DD HH:mm:ss.SSS')} | ${this.fullUpstreamNameLogs} | Error: ${err.message}`);
          resolve();
        });
      });
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  async onNewRound(miningInfoGrpc) {
    if (this.upstreamConfig.sendTargetDL) {
      miningInfoGrpc.targetDeadline = this.upstreamConfig.sendTargetDL;
    }
    const miningInfo = new MiningInfo(
      miningInfoGrpc.height,
      miningInfoGrpc.baseTarget,
      miningInfoGrpc.generationSignature.toString('hex'),
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
      // Add historical, but wait some time till the wallet has caught up
      await new Promise(resolve => setTimeout(resolve, 5 * 1000));
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
    try {
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

      return {
        error: null,
        result: {
          result: 'success',
          deadline: BigNumber(submitNonceResponse.deadline).toNumber(),
        },
      };
    } catch (err) {
      return {
        error: {
          message: err.message,
          code: 4,
        },
      };
    }
  }

  async getBlockWinnerAccountId(height) {
    const block = await new Promise((resolve, reject) => {
      this.client.getBlock({
        height,
        includeTransactions: false,
      }, (err, block) => {
        if (err) {
          return reject(err);
        }

        resolve(block);
      });
    });

    return util.getIdForPublicKeyBuffer(block.generatorPublicKey);
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