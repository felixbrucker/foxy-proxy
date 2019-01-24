class CurrentRound {

  constructor(upstream, miningInfo, eventEmitter) {
    this.upstream = upstream;
    this.miningInfo = miningInfo;
    this.prio = upstream.upstreamConfig.prio || 10;
    this.maxScanTime = upstream.upstreamConfig.maxScanTime || 60;
    this.eventEmitter = eventEmitter;
    this.scanDone = false;
  }

  start() {
    this.timeoutId = setTimeout(() => {
      this.scanDone = true;
      this.eventEmitter.emit('scan-done');
    }, this.maxScanTime * 1000);
  }

  cancel() {
    if (!this.timeoutId) {
      return;
    }
    clearTimeout(this.timeoutId);
    this.timeoutId = null;
  }
}