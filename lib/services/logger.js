const chalk = require('chalk');
const moment = require('moment');
const rfs = require('rotating-file-stream');
const eventBus = require('./event-bus');
const store = require('./store');

class Logger {
  static getLogLevelNumber(logLevel) {
    switch (logLevel) {
      case 'trace': return 1;
      case 'debug': return 2;
      case 'info': return 3;
      case 'error': return 4;
    }
  }

  constructor() {
    eventBus.subscribe('log/info', (msg) => this.onLogs('info', msg));
    eventBus.subscribe('log/debug', (msg) => this.onLogs('debug', msg));
    eventBus.subscribe('log/trace', (msg) => this.onLogs('trace', msg));
    eventBus.subscribe('log/error', (msg) => this.onLogs('error', msg));
  }

  onLogs(logLevel, msg) {
    if (store.getUseLiveDashboard()) {
      return;
    }
    if (Logger.getLogLevelNumber(store.logging.level) > Logger.getLogLevelNumber(logLevel)) {
      return;
    }
    const logLine = `${moment().format('YYYY-MM-DD HH:mm:ss.SSS')} [${logLevel.toUpperCase()}] | ${msg}`;
    if (this.logWriter) {
      this.logWriter.write(`${logLine}\n`);
    }
    switch (logLevel) {
      case 'trace':
      case 'debug':
        console.log(store.getUseColors() ? chalk.grey(logLine) : logLine);
        break;
      case 'info':
        console.log(logLine);
        break;
      case 'error':
        console.error(store.getUseColors() ? chalk.red(logLine) : logLine);
        break;
    }
  }

  enableFileLogging() {
    if (this.logWriter) {
      return;
    }

    this.logWriter = rfs.createStream(Logger.logFileGenerator, {
      size: '10M',
      interval: '1d',
      path: store.logging.dir,
      maxFiles: store.logging.maxFiles,
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
