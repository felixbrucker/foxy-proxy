#!/usr/bin/env node

const { fork } = require('child_process');

class FoxyProxy {
  constructor() {
    this.start();
  }

  start() {
    this.app = fork(`${__dirname}/app.js`, process.argv.slice(1), {
      cwd: process.cwd(),
    });
    this.app.on('message', this.onMessage.bind(this));
  }

  stop() {
    if (!this.app) {
      return;
    }
    this.app.kill();
    this.app = null;
  }

  onMessage(message) {
    switch(message) {
      case 'restart':
        this.stop();
        this.start();
        break;
    }
  }
}

const foxyProxy = new FoxyProxy();
