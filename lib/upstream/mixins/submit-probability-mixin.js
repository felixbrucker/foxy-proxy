const eventBus = require('../../services/event-bus');

module.exports = (upstreamClass) => class SubmitProbabilityMixin extends upstreamClass {
  async init() {
    this.useSubmitProbability = !!this.upstreamConfig.submitProbability;
    this.targetDLFactor = null;
    if (this.useSubmitProbability) {
      const submitProbability = this.upstreamConfig.submitProbability > 10 ? this.upstreamConfig.submitProbability / 100 : this.upstreamConfig.submitProbability;
      this.targetDLFactor = -1 * Math.log(1 - submitProbability) * (this.blockTime);
    }
    if (super.init) {
      await super.init();
    }
  }

  updateDynamicTargetDL(miningInfo) {
    const totalCapacityInTiB = this.getTotalCapacity() / 1024;
    if (totalCapacityInTiB === 0) {
      this.dynamicTargetDeadline = null;
      return;
    }
    this.dynamicTargetDeadline = Math.round(this.targetDLFactor * miningInfo.netDiff / totalCapacityInTiB);
    const dynamicTargetDeadlineFormatted = this.proxyConfig.humanizeDeadlines ? this.getFormattedDeadline(this.dynamicTargetDeadline) : this.dynamicTargetDeadline;
    eventBus.publish('log/debug', `${this.fullUpstreamNameLogs} | Submit Probability | Using targetDL ${dynamicTargetDeadlineFormatted}`);
  }

  get blockTime() {
    switch (this.upstreamConfig.coin) {
      case 'BHD':
      case 'BOOM':
      case 'BURST':
      case 'DISC':
        return 240;
      case 'LHD':
        return 300;
      default: return 240;
    }
  }
};