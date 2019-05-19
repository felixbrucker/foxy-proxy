module.exports = (upstreamClass) => class CliColorMixin extends upstreamClass {
  async init() {
    this.newBlockLineColor = this.upstreamConfig.newBlockLineColor || 'green';
    this.newBlockColor = this.upstreamConfig.newBlockColor || null;
    this.newBlockBaseTargetColor = this.upstreamConfig.newBlockBaseTargetColor || null;
    this.newBlockNetDiffColor = this.upstreamConfig.newBlockNetDiffColor || null;
    this.newBlockTargetDeadlineColor = this.upstreamConfig.newBlockTargetDeadlineColor || null;
    this.minerColor = this.upstreamConfig.minerColor || null;
    this.accountColor = this.upstreamConfig.accountColor || null;
    this.deadlineColor = this.upstreamConfig.deadlineColor || null;
    if (super.init) {
      await super.init();
    }
  }
};