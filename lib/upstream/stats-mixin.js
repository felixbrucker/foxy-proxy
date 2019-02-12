const database = require('../../models');
const util = require('./util');

module.exports = (upstreamClass) => class StatsMixin extends upstreamClass {
  getBestDL() {
    return util.getBestDL(this.deadlines);
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
        ['blockHeight', 'DESC'],
      ],
    });
  }

  async getStats() {
    const upstreamStats = {
      name: this.upstreamConfig.name,
      fullName: this.fullUpstreamName,
      isBHD: !!this.upstreamConfig.isBHD,
    };
    const currentRoundStats = this.getCurrentRoundStats();
    const historicalStats = await this.getHistoricalStats();

    return {
      ...upstreamStats,
      ...currentRoundStats,
      ...historicalStats,
    };
  }
};