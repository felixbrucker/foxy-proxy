module.exports = (upstreamClass) => class SubmitProbabilityMixin extends upstreamClass {
  async init() {
    this.useSubmitProbability = !!this.upstreamConfig.submitProbability;
    this.targetDLFactor = null;
    if (this.useSubmitProbability) {
      this.targetDLFactor = -1 * Math.log(1 - this.upstreamConfig.submitProbability) * (this.isBHD ? 300 : 240);
    }
    if (super.init) {
      await super.init();
    }
  }
};