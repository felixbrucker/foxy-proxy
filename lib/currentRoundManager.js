const EventEmitter = require('events');

const CurrentRound = require('./currentRound');

class CurrentRoundManager {

  constructor(maxScanTime) {
    this.maxScanTime = maxScanTime;
    this.roundQueue = [];
    this.currentRound = {scanDone: true, prio: 9999};
    this.eventEmitter = new EventEmitter();
    this.eventEmitter.on('scan-done', this.updateCurrentRound.bind(this));
  }

  getMiningInfo() {
    return this.currentRound.miningInfo.toObject();
  }

  updateCurrentRound() {
    if (this.roundQueue.length === 0) {
      return;
    }
    this.currentRound = this.roundQueue.shift();
    this.currentRound.start();
  }

  addNewRound(upstream, miningInfo) {
    const currentRound = new CurrentRound(upstream, miningInfo, this.eventEmitter, this.maxScanTime);
    this.roundQueue = this.roundQueue.filter(currRound => currRound.upstream !== upstream);

    this.roundQueue.push(currentRound);
    this.roundQueue.sort((a, b) => b.prio - a.prio);

    // overwrite old round directly if from same upstream
    if (this.currentRound.upstream === this.roundQueue[0].upstream) {
      if (!this.currentRound.scanDone) {
        this.currentRound.cancel();
      }
      this.currentRound = this.roundQueue.shift();
      this.currentRound.start();
      return;
    }

    // new high prio round, use it now and get back to the other one later if it was still running
    if (this.currentRound.prio < this.roundQueue[0].prio) {
      if (!this.currentRound.scanDone) {
        this.currentRound.cancel();
        this.roundQueue.push(this.currentRound);
        this.roundQueue.sort((a, b) => b.prio - a.prio);
      }
      this.currentRound = this.roundQueue.shift();
      this.currentRound.start();
    }

    // init
    if (this.currentRound.scanDone) {
      this.updateCurrentRound();
    }
  }

  copyRoundsFromManager(currentRoundManager) {
    this.addNewRound(
      currentRoundManager.currentRound.upstream,
      currentRoundManager.currentRound.miningInfo
    );
    currentRoundManager.roundQueue.forEach(round => {
      this.addNewRound(
        round.upstream,
        round.miningInfo
      );
    });
  }
}

module.exports = CurrentRoundManager;
