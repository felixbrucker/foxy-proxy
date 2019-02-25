const moment = require('moment');
const eventBus = require('./event-bus');
const store = require('./store');

class Logger {
  static getLogLevelNumber(logLevel) {
    switch (logLevel) {
      case 'debug': return 1;
      case 'info': return 2;
      case 'error': return 3;
    }
  }

  static onLogs(logLevel, msg) {
    if (store.getUseLiveDashboard()) {
      return;
    }
    if (Logger.getLogLevelNumber(store.getLogLevel()) > Logger.getLogLevelNumber(logLevel)) {
      return;
    }
    switch (logLevel) {
      case 'debug':
      case 'info':
        console.log(`${moment().format('YYYY-MM-DD HH:mm:ss.SSS')} | ${msg}`);
        break;
      case 'error':
        console.error(`${moment().format('YYYY-MM-DD HH:mm:ss.SSS')} | ${msg}`);
        break;
    }
  }

  constructor() {
    eventBus.subscribe('log/info', (msg) => Logger.onLogs('info', msg));
    eventBus.subscribe('log/debug', (msg) => Logger.onLogs('debug', msg));
    eventBus.subscribe('log/error', (msg) => Logger.onLogs('error', msg));
  }
}

module.exports = new Logger();
