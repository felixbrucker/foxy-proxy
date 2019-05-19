const { existsSync } = require('fs');
const { resolve } = require('path');
const spawn = require('cross-spawn');
const eventBus = require('./event-bus');
const database = require('../../models');
const store = require('./store');

class SelfUpdateService {
  constructor() {
    eventBus.subscribe('version/update', this.update.bind(this));
    this.rootDir = resolve(`${__dirname}/../../`);
  }

  detectInstallMethod() {
    if (store.isInstalledGlobally()) {
      return 'npm';
    }
    const gitPath = resolve(`${this.rootDir}/.git`);
    if (existsSync(gitPath)) {
      return 'git';
    }

    return null;
  }

  async update() {
    const installMethod = this.detectInstallMethod();
    let result = null;
    switch (installMethod) {
      case 'git':
        result = await this.updateUsingGit();
        break;
      case 'npm':
        result = await this.updateUsingNpm();
        break;
      default:
        eventBus.publish('log/error', 'SelfUpdater | Could not determine install method, no automatic update possible!');
        return;
    }
    if (!result) {
      return;
    }
    if (typeof process.send !== 'function') {
      return;
    }
    eventBus.publish('log/info', 'SelfUpdater | Successfully updated, restarting now ..');
    await database().sequelize.close();
    process.send('restart');
  }

  async updateUsingGit() {
    let git = spawn('git', ['checkout', 'package-lock.json'], {
      cwd: this.rootDir,
      stdio: 'pipe',
    });
    git.stdout.on('data', (data) => eventBus.publish('log/info', `SelfUpdater | GIT ==> ${data.toString().trim()}`));
    git.stderr.on('data', (data) => eventBus.publish('log/error', `SelfUpdater | GIT ==> ${data.toString().trim()}`));
    let success = await new Promise((resolve) => {
      git.on('close', (code) => resolve(code === 0));
    });
    if (!success) {
      return;
    }
    git = spawn('git', ['pull'], {
      cwd: this.rootDir,
      stdio: 'pipe',
    });
    git.stdout.on('data', (data) => eventBus.publish('log/info', `SelfUpdater | GIT ==> ${data.toString().trim()}`));
    git.stderr.on('data', (data) => eventBus.publish('log/error', `SelfUpdater | GIT ==> ${data.toString().trim()}`));
    success = await new Promise((resolve) => {
      git.on('close', (code) => resolve(code === 0));
    });
    if (!success) {
      return;
    }
    const npm = spawn('npm', ['install'], {
      cwd: this.rootDir,
      stdio: 'pipe',
    });
    npm.stdout.on('data', (data) => eventBus.publish('log/info', `SelfUpdater | NPM ==> ${data.toString().trim()}`));
    npm.stderr.on('data', (data) => eventBus.publish('log/error', `SelfUpdater | NPM ==> ${data.toString().trim()}`));
    success = await new Promise((resolve) => {
      npm.on('close', (code) => resolve(code === 0));
    });
    if (!success) {
      return;
    }

    return true;
  }

  async updateUsingNpm() {
    const npm = spawn('npm', ['update', '-g', 'bhd-burst-proxy'], {
      stdio: 'pipe',
    });
    npm.stdout.on('data', (data) => eventBus.publish('log/info', `SelfUpdater | NPM ==> ${data.toString().trim()}`));
    npm.stderr.on('data', (data) => eventBus.publish('log/error', `SelfUpdater | NPM ==> ${data.toString().trim()}`));
    const success = await new Promise((resolve) => {
      npm.on('close', (code) => resolve(code === 0));
    });
    if (!success) {
      return;
    }

    return true;
  }
}

module.exports = new SelfUpdateService();
