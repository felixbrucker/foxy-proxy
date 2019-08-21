const { queue } = require('async');
const database = require('../../models');

class PersistingService {
  constructor() {
    this.createOrUpdateRoundQueue = queue(PersistingService.createOrUpdateRoundQueueHandler);
  }

  async createOrUpdateRound(roundPrototype) {
    return new Promise((resolve, reject) => this.createOrUpdateRoundQueue.push(roundPrototype, (err, res) => {
      if (err) {
        return reject(err);
      }
      resolve(res);
    }));
  }

  static async createOrUpdateRoundQueueHandler(roundPrototype) {
    const [round, created] = await database().round.findOrCreate({
      where: {
        upstream: roundPrototype.upstream,
        blockHeight: roundPrototype.blockHeight,
      },
      defaults: roundPrototype,
    });
    if (!created) {
      round.baseTarget = roundPrototype.baseTarget;
      round.netDiff = roundPrototype.netDiff;
      round.bestDL = roundPrototype.bestDL;
      round.bestDLSubmitted = roundPrototype.bestDLSubmitted;
      round.roundWon = roundPrototype.roundWon;
      await round.save();
    }

    return round;
  }
}

module.exports = new PersistingService();
