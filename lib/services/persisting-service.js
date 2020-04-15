const database = require('../../models');
const ProcessingQueue = require('../processing-queue');

class PersistingService {
  constructor() {
    this.processingQueue = new ProcessingQueue();
    this.processingQueue.registerHandler('createOrUpdateRound', this.createOrUpdateRoundHandler.bind(this));
    this.processingQueue.registerHandler('removeOldRounds', this.removeOldRoundsHandler.bind(this));
  }

  async createOrUpdateRound(roundPrototype) {
    return this.processingQueue.push({type: 'createOrUpdateRound', data: roundPrototype});
  }

  async removeOldRounds({upstream, roundsToKeep}) {
    return this.processingQueue.push({type: 'removeOldRounds', data: {upstream, roundsToKeep}});
  }

  async createOrUpdateRoundHandler(roundPrototype) {
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

  async removeOldRoundsHandler({upstream, roundsToKeep}) {
    const rounds = await database().round.findAll({
      where: {
        upstream,
      },
      order: [
        ['blockHeight', 'DESC'],
      ],
      offset: roundsToKeep,
    });
    for (let round of rounds) {
      await round.destroy();
    }
  }
}

module.exports = new PersistingService();
