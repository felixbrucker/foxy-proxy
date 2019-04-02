const BigNumber = require('bignumber.js');
const EventEmitter = require('events');
const grpc = require('grpc');
const protoLoader = require('@grpc/proto-loader');
const connectionQualityMixin = require('../mixins/connection-quality-mixin');
const database = require('../../../models');
const estimatedCapacityMixin = require('../mixins/estimated-capacity-mixin');
const eventBus = require('../../services/event-bus');
const MiningInfo = require('../../miningInfo');
const statsMixin = require('../mixins/stats-mixin');
const submitProbabilityMixin = require('../mixins/submit-probability-mixin');
const util = require('../util');

class BurstGrpc extends submitProbabilityMixin(
    statsMixin(estimatedCapacityMixin(connectionQualityMixin(EventEmitter)))
) {
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
    this.running = true;
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

    this.client = new protoDescriptor.BrsApiService(this.upstreamConfig.url, grpc.credentials.createInsecure());

    this.startMiningInfoRetrieval();
  }

  async startMiningInfoRetrieval() {
    // endless loop to catch connection issues and trigger a reconnect
    while(this.running) {
      this.connected = true;
      await new Promise(resolve => {
        const miningInfoEvents = this.client.getMiningInfo();
        miningInfoEvents.on('data', this.onNewRound.bind(this));
        miningInfoEvents.once('end', resolve);
        miningInfoEvents.once('error', (err) => {
          eventBus.publish('log/error', `${this.fullUpstreamNameLogs} | Error: ${err.message}`);
          resolve();
        });
      });
      this.connected = false;
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
    let newBlockLine = `${this.fullUpstreamNameLogs} | New block ${miningInfo.height}, baseTarget ${miningInfo.baseTarget}, netDiff ${miningInfo.netDiff.toFixed(0)} TB`;
    if (miningInfo.targetDeadline) {
      newBlockLine += `, targetDeadline: ${miningInfo.targetDeadline}`;
    }
    eventBus.publish('log/info', newBlockLine);

    if (isFork) {
      return;
    }

    if (lastBlockHeight !== 0) {
      // Add historical, but wait some time till the wallet has caught up
      await new Promise(resolve => setTimeout(resolve, 5 * 1000));
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

  async submitNonce(submission) {
    let secretPhrase = null;
    if (submission.secretPhrase) {
      secretPhrase = submission.secretPhrase;
    } else if (this.upstreamConfig.passphrases && this.upstreamConfig.passphrases[submission.accountId]) {
      secretPhrase = this.upstreamConfig.passphrases[submission.accountId];
    } else {
      secretPhrase = this.upstreamConfig.passphrase;
    }
    if (!secretPhrase) {
      return {
        error: {
          message: 'No passphrase configured for this accountId',
          code: 2,
        },
      };
    }
    try {
      const submitNonceResponse = await new Promise((resolve, reject) => {
        this.client.submitNonce({
          secretPhrase,
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
    try {
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
    } catch (err) {
      eventBus.publish('log/error', `${this.fullUpstreamNameLogs} | Error: ${err.message}`);
    }

    return null;
  }

  getMiningInfo() {
    return this.miningInfo.toObject();
  }
}

module.exports = BurstGrpc;