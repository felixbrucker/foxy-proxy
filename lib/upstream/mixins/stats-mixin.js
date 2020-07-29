const database = require('../../../models');
const util = require('../util');
const cache = require('../../services/cache');
const roundPopulator = require('../../services/round-populator');

module.exports = (upstreamClass) => class StatsMixin extends upstreamClass {
  constructor() {
    super();
    this.totalCapacity = 0;
  }

  getBestDL() {
    return util.getBestDL(this.deadlines);
  }

  getConnectionStats() {
    return {
      connected: this.connected !== undefined ? this.connected : true,
      connectionQuality: this.connectionQuality !== undefined ? this.connectionQuality : 100,
    };
  }

  getCurrentRoundStats() {
    const bestDL = this.getBestDL();

    return {
      blockNumber: this.miningInfo.height,
      netDiff: this.miningInfo.netDiff,
      roundStart: this.roundStart,
      bestDL: bestDL ? bestDL.toString() : null,
    };
  }

  async getHistoricalStats() {
    const estimatedCapacityInTB = await this.getEstimatedCapacity();

    const historicalRounds = await this.getHistoricalRounds();

    return {
      estimatedCapacityInTB,
      roundsWon: historicalRounds.filter(round => round.roundWon).length,
      roundsSubmitted: historicalRounds.filter(round => round.bestDLSubmitted).length,
      roundsWithDLs: historicalRounds.filter(round => round.bestDL).length,
      totalRounds: historicalRounds.length,
      historicalRounds,
    };
  }

  getHistoricalRounds() {
    return database().round.findAll({
      where: {
        upstream: this.fullUpstreamName,
      },
      order: [
        ['blockHeight', 'ASC'],
      ],
    });
  }

  async getStats() {
    const upstreamStats = {
      name: this.upstreamConfig.name,
      color: this.upstreamConfig.color,
      fullName: this.fullUpstreamName,
      isBHD: this.isBHD || !!this.upstreamConfig.isBHD,
      coin: this.upstreamConfig.coin,
    };
    const connectionStats = this.getConnectionStats();
    const currentRoundStats = this.getCurrentRoundStats();
    const historicalStats = await this.getHistoricalStats();

    return {
      ...upstreamStats,
      ...connectionStats,
      ...currentRoundStats,
      ...historicalStats,
    };
  }

  getTotalCapacity() {
    if (this.upstreamConfig.capacity !== undefined) {
      return parseInt(this.upstreamConfig.capacity, 10);
    }

    return util.getTotalMinerCapacity(this.miners);
  }

  recalculateTotalCapacity() {
    this.totalCapacity = this.getTotalCapacity();
  }

  async createOrUpdateRound({ miningInfo }) {
    if (!miningInfo || !miningInfo.height) {
      return;
    }
    await cache.createOrUpdateRound({
      upstream: this.fullUpstreamName,
      blockHeight: miningInfo.height,
      baseTarget: miningInfo.baseTarget,
      netDiff: miningInfo.netDiff,
    });
  }

  async onRoundEnded({ oldMiningInfo }) {
    if (!oldMiningInfo || !oldMiningInfo.height) {
      return;
    }

    if (this.canFetchBlockInfo()) {
      await new Promise(resolve => setTimeout(resolve, 10 * 1000));
      await roundPopulator.populateUnpopulatedRounds(this, oldMiningInfo.height);
    }

    await cache.removeOldCachedRounds(this, oldMiningInfo.height);
    await cache.removeOldRounds({
      upstream: this.fullUpstreamName,
      roundsToKeep: this.upstreamConfig.historicalRoundsToKeep || 720,
    });
  }

  async getActivePlotter(height) {
    return database().plotter.findAll({
      where: {
        upstream: this.fullUpstreamName,
        lastSubmitHeight: {
          [database().Op.gte]: height - 100,
        },
      },
    });
  }

  get walletUrl() {
    let walletUrl = this.upstreamConfig.walletUrl;
    if (!walletUrl && this.upstreamConfig.mode === 'solo') {
      walletUrl = this.upstreamConfig.url;
    }

    return walletUrl;
  }

  canFetchBlockInfo() {
    return !!(this.walletUrl && this.upstreamConfig.coin);
  }

  getBlockInfo(height) {
    if (!this.canFetchBlockInfo()) {
      return null;
    }

    switch (this.upstreamConfig.coin) {
      case 'LHD':
      case 'HDD':
      case 'XHD':
      case 'DISC':
      case 'BHD': return util.getBhdBlockInfo({ url: this.walletUrl, height });
      case 'BURST': return util.getBurstBlockInfo({ url: this.walletUrl, height });
      default: return null;
    }
  }
};