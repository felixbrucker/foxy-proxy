const chalk = require('chalk');
const nodemailer = require('nodemailer');
const moment = require('moment');
const eventBus = require('./event-bus');
const store = require('./store');

class MailService {
  async init() {
    this.mailSettings = store.getMailSettings();
    if (!this.mailSettings) {
      return;
    }

    if (!this.validateMailSettings()) {
      return;
    }

    this.transport = nodemailer.createTransport({
      host: this.mailSettings.host,
      port: this.mailSettings.port,
      secure: this.mailSettings.secure,
      auth: {
        user: this.mailSettings.user,
        pass: this.mailSettings.pass,
      },
    });

    const successful = await this.verifyTransport();
    if (!successful) {
      this.transport = null;
      return;
    }

    eventBus.subscribe('miner/online', this.onMinerOnline.bind(this));
    eventBus.subscribe('miner/offline', this.onMinerOffline.bind(this));

    const startupLine = 'Mail | Initialized';
    eventBus.publish('log/info', store.getUseColors() ? chalk.green(startupLine) : startupLine);
  }

  async onMinerOnline(minerId, offlineSince) {
    await this.sendMail({
      from: this.mailSettings.mailFrom || this.mailSettings.user,
      to: this.mailSettings.mailTo,
      subject: `[Foxy-Proxy] ${minerId} has recovered`,
      text: `${minerId} has recovered after ${moment(offlineSince).fromNow(true)} of downtime`,
    });
  }

  async onMinerOffline(minerId, miner) {
    await this.sendMail({
      from: this.mailSettings.mailFrom || this.mailSettings.user,
      to: this.mailSettings.mailTo,
      subject: `[Foxy-Proxy] ${minerId} looks offline`,
      text: `${minerId} seems to be offline.\nLast active: ${moment(miner.lastTimeActive).fromNow()}\nLast active block: ${miner.lastBlockActive}`,
    });
  }

  validateMailSettings() {
    if (!this.mailSettings.host) {
      eventBus.publish('log/error', 'Mail | Validation error: host missing');
      return false;
    }
    if (!this.mailSettings.port) {
      eventBus.publish('log/error', 'Mail | Validation error: port missing');
      return false;
    }
    if (this.mailSettings.secure === undefined) {
      eventBus.publish('log/error', 'Mail | Validation error: useTLS missing');
      return false;
    }
    if (!this.mailSettings.user) {
      eventBus.publish('log/error', 'Mail | Validation error: user missing');
      return false;
    }
    if (!this.mailSettings.pass) {
      eventBus.publish('log/error', 'Mail | Validation error: pass missing');
      return false;
    }
    if (!this.mailSettings.mailTo) {
      eventBus.publish('log/error', 'Mail | Validation error: mailTo missing');
      return false;
    }

    return true;
  }

  async verifyTransport(){
    try {
      await this.transport.verify();
    } catch(err) {
      eventBus.publish('log/error', `Mail | Connection Verification failed: ${err.message}`);
      return false;
    }

    return true;
  }

  async sendMail(options) {
    let result = null;
    try {
      result = await this.transport.sendMail(options);
    } catch(err) {
      eventBus.publish('log/error', `Mail | Sending mail failed: ${err.message}`);
    }

    return result;
  }
}

module.exports = new MailService();
