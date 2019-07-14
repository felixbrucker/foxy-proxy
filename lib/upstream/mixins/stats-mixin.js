const database = require('../../../models');
const util = require('../util');

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
};