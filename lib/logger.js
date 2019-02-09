const moment = require('moment');
const eventBus = require('./event-bus');
const store = require('./store');

class Logger {
  constructor() {
    eventBus.subscribe('log/info', this.onInfo);
    eventBus.subscribe('log/error', this.onError);
  }

  onInfo(msg) {
    if (store.getUseLiveDashboard()) {
      return;
    }
    console.log(`${moment().format('YYYY-MM-DD HH:mm:ss.SSS')} | ${msg}`);
  }

  onError(msg) {
    if (store.getUseLiveDashboard()) {
      return;
    }
    console.error(`${moment().format('YYYY-MM-DD HH:mm:ss.SSS')} | ${msg}`);
  }
}

module.exports = new Logger();
