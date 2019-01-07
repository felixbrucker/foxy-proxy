const BigNumber = require('bignumber.js');
const bytes = require('bytes');
const database = require('../models');
const eventBus = require('./event-bus');
const GenericUpstream = require('./upstream/generic');
const HDPool = require('./upstream/hdpool');
const MinerRound = require('./minerRound');

class Proxy {
  static getUpstreamClass(type) {
    switch (type) {
      case 'hdpool':
        return HDPool;
      default:
        return GenericUpstream;
    }
  }

  constructor(upstreamConfig) {
    this.upstreamConfig = upstreamConfig;
  }

  async init() {
    const upstreamClass = Proxy.getUpstreamClass(this.upstreamConfig.type);
    this.upstream = new upstreamClass(this.upstreamConfig);
    await this.upstream.init();
  }

  getMiningInfo() {
    return this.upstream.getMiningInfo();
  }

  async handleSubmitNonce(ctx) {
    // blago does not submit the blockheight
    const blockheight = ctx.query.blockheight ? ctx.query.blockheight : this.upstream.miningInfo.height;
    const minerRound = new MinerRound(
      ctx.query.accountId,
      blockheight,
      ctx.query.nonce,
      ctx.query.deadline
    );
    let minerName = ctx.req.headers['x-minername'];
    if (!minerName) {
      minerName = ctx.req.headers['x-miner'];
    }
    if (!minerName) {
      minerName = 'unknown';
    }
    const minerId = `${ctx.request.ip}/${minerName}`;
    if (!this.upstream.miners[minerId]) {
      this.upstream.miners[minerId] = {};
    }
    this.upstream.miners[minerId].lastBlockActive = minerRound.height;
    this.upstream.miners[minerId].capacity = bytes(`${ctx.req.headers['x-capacity']}GB`);

    if (!minerRound.isValid()) {
      ctx.status = 400;
      ctx.body = {
        error: {
          message: 'submission has wrong format',
          code: 1,
        },
      };
      return;
    }
    if (minerRound.height !== this.upstream.miningInfo.height) {
      ctx.status = 400;
      ctx.body = {
        error: {
          message: 'submission is for different round',
          code: 2,
        },
      };
      return;
    }

    // Probably safe as integer, but use bignum just in case
    const adjustedDL = minerRound.deadline.dividedBy(this.upstream.miningInfo.baseTarget).integerValue(BigNumber.ROUND_FLOOR);

    const bestDLForAcc = this.upstream.deadlines[minerRound.accountId];

    // Do not submit worse DLs than already submitted
    if (bestDLForAcc && bestDLForAcc.isLessThanOrEqualTo(adjustedDL)) {
      ctx.body = {
        result: 'success',
        deadline: adjustedDL.toNumber(),
      };
      return;
    }

    this.upstream.deadlines[minerRound.accountId] = adjustedDL;
    eventBus.publish('stats/new');

    // DL too high to submit
    if (adjustedDL.isGreaterThan(this.upstreamConfig.targetDL)) {
      ctx.body = {
        result: 'success',
        deadline: adjustedDL.toNumber(),
      };
      return;
    }
    if (this.upstream.miningInfo.targetDeadline && adjustedDL.isGreaterThan(this.upstream.miningInfo.targetDeadline)) {
      ctx.body = {
        result: 'success',
        deadline: adjustedDL.toNumber(),
      };
      return;
    }

    const result = await this.upstream.submitNonce(minerRound, ctx);
    if (result.error) {
      console.error(`${new Date().toISOString()} | ${this.upstreamConfig.name} | ${minerId} tried submitting DL ${adjustedDL.toString()}, failed`);
      ctx.status = 400;
      ctx.body = {
        error: result.error,
      };
      return;
    }

    let realResult = result.result;
    if (!realResult) {
      // emulate response
      realResult = {
        result: 'success',
        deadline: adjustedDL.toNumber(),
      };
    }
    if (realResult.result === 'success') {
      console.log(`${new Date().toISOString()} | ${this.upstreamConfig.name} | ${minerId} submitted DL ${adjustedDL.toString()}`);
    } else {
      console.error(`${new Date().toISOString()} | ${this.upstreamConfig.name} | ${minerId} tried submitting DL ${adjustedDL.toString()}, failed`);
    }

    ctx.body = realResult
  }

  async getStats() {
    const miners = Object.keys(this.upstream.miners).map(key => this.upstream.miners[key]);
    const totalCapacity = miners.reduce((acc, miner) => {
      return acc + (miner.capacity || 0);
    }, 0);

    const bestDL = this.upstream.getBestDL();

    const historicalRounds = await database().round.findAll({
      where: {
        upstream: this.upstreamConfig.name,
      },
      order: [
        ['blockHeight', 'DESC'],
      ],
    });

    return {
      name: this.upstreamConfig.name,
      isBHD: this.upstream.isBHD,
      blockNumber: this.upstream.miningInfo.height,
      netDiff: this.upstream.miningInfo.netDiff,
      roundStart: this.upstream.roundStart,
      bestDL: bestDL ? bestDL.toString() : null,
      miner: this.upstream.miners,
      totalCapacity,
      roundsWon: historicalRounds.filter(round => round.roundWon).length,
      roundsSubmitted: historicalRounds.filter(round => round.bestDLSubmitted).length,
      roundsWithDLs: historicalRounds.filter(round => round.bestDL).length,
      totalRounds: historicalRounds.length,
    };
  }
}

module.exports = Proxy;