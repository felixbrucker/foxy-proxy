class CurrentRound {

  constructor(upstream, miningInfo, eventEmitter, maxScanTime) {
    this.upstream = upstream;
    this.miningInfo = miningInfo;
    this.weight = (upstream && (upstream.weight || upstream.upstreamConfig.prio || upstream.upstreamConfig.weight)) || 10;
    this.maxScanTime = maxScanTime;
    this.eventEmitter = eventEmitter;
    this.scanDone = false;
    this.startedAt = null;
  }

  start() {
    this.startedAt = new Date();
    this.timeoutId = setTimeout(() => {
      this.scanDone = true;
      this.timeoutId = null;
      this.eventEmitter.emit('scan-done');
    }, this.maxScanTime * 1000);
  }

  cancel() {
    if (!this.timeoutId) {
      return;
    }
    clearTimeout(this.timeoutId);
    this.timeoutId = null;
    this.startedAt = null;
  }

  getStartedAt() {
    return this.startedAt;
  }

  getHeight() {
    return this.miningInfo.height;
  }
}

module.exports = CurrentRound;
