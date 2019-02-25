const moment = require('moment');
const rfs = require('rotating-file-stream');
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

  constructor() {
    eventBus.subscribe('log/info', (msg) => this.onLogs('info', msg));
    eventBus.subscribe('log/debug', (msg) => this.onLogs('debug', msg));
    eventBus.subscribe('log/error', (msg) => this.onLogs('error', msg));
  }

  onLogs(logLevel, msg) {
    const logLine = `${moment().format('YYYY-MM-DD HH:mm:ss.SSS')} | ${msg}`;
    if (this.logWriter) {
      this.logWriter.write(`${logLine}\n`);
    }
    if (store.getUseLiveDashboard()) {
      return;
    }
    if (Logger.getLogLevelNumber(store.getLogLevel()) > Logger.getLogLevelNumber(logLevel)) {
      return;
    }
    switch (logLevel) {
      case 'debug':
      case 'info':
        console.log(logLine);
        break;
      case 'error':
        console.error(logLine);
        break;
    }
  }

  enableFileLogging() {
    if (this.logWriter) {
      return;
    }

    this.logWriter = rfs(Logger.logFileGenerator, {
      size: '10M',
      interval: '1m',
      path: store.getLogDir(),
    });
  }

  static logFileGenerator(time, index) {
    const fileName = 'proxy.log';
    if (!time) {
      return fileName;
    }

    return `${moment(time).format('YYYY-MM-DD')}-${index}-${fileName}`;
  }
}

module.exports = new Logger();
