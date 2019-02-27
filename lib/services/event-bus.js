const EventEmitter = require('events');

class EventBus {
  constructor() {
    this.emitter = new EventEmitter();
  }

  publish(topic, ...msg) {
    this.emitter.emit(topic, ...msg);
  }

  subscribe(topic, cb) {
    this.emitter.on(topic, cb);
  }
}

module.exports = new EventBus();
