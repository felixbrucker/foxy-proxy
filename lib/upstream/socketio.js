const io = require('socket.io-client');
const { hostname } = require('os');
const BaseUpstream = require('./base');
const database = require('../../models');
const eventBus = require('../services/event-bus');
const MiningInfo = require('../miningInfo');
const util = require('./util');
const version = require('../version');
const outputUtil = require('../output-util');

class SocketIo extends BaseUpstream {
  constructor(upstreamConfig, miners, proxyConfig) {
    super();
    this.fullUpstreamName = `${proxyConfig.name}/${upstreamConfig.name}`;
    this.fullUpstreamNameLogs = outputUtil.getFullUpstreamNameLogs(proxyConfig, upstreamConfig);
    this.isBHD = upstreamConfig.isBHD;
    this.upstreamConfig = upstreamConfig;
    this.upstreamConfig.mode = 'pool'; // For now
    this.historicalRoundsToKeep = this.upstreamConfig.historicalRoundsToKeep || (this.isBHD ? 288 : 360) * 2;
    this.userAgent = `Foxy-Proxy ${version}`;
    this.miningInfo = {height: 0, toObject: () => ({height: 0})};
    this.deadlines = {};
    this.miners = miners;
    this.roundStart = new Date();
  }

  async init() {
    await super.init();

    this.clients = {};

    const urlMappings = this.getUpstreamUrlMappings();
    let doHandlerSetup = true;
    for (let urlMapping of urlMappings.values()) {
      await this.setupMinersForUrl(urlMapping, doHandlerSetup);
      doHandlerSetup = false;
    }
  }

  async setupMinersForUrl(urlMapping, doHandlerSetup) {
    const client = io(urlMapping.url);

    if (urlMapping.accountIds.length > 0) {
      urlMapping.accountIds.forEach(accountId => this.clients[accountId] = client);
    } else {
      this.client = client;
    }

    client.on('connect', () => {
      this.connected = true;
      eventBus.publish('log/debug', `${this.fullUpstreamNameLogs} | url=${urlMapping.url} | socketio opened`);
    });
    client.on('disconnect', () => {
      this.connected = false;
      eventBus.publish('log/debug', `${this.fullUpstreamNameLogs} | url=${urlMapping.url} | socketio closed`);
    });

    if (!doHandlerSetup) {
      return;
    }

    client.on('miningInfo', this.onNewRound.bind(this));
    if (this.upstreamConfig.maxScanTime) {
      client.emit('setMaxScanTime', this.upstreamConfig.maxScanTime);
    }
    client.on('connect', () => client.emit('getMiningInfo', this.onNewRound.bind(this)));

    // Wait for miningInfo up to 10 sec
    await new Promise(resolve => {
      let resolved = false;
      let timeout = setTimeout(() => {
        if (resolved) {
          return;
        }
        resolve();
      }, 10 * 1000);
      client.emit('getMiningInfo', async para => {
        await this.onNewRound(para);
        if (resolved) {
          return;
        }
        clearTimeout(timeout);
        resolved = true;
        resolve();
      });
    });
  }

  async onNewRound(para) {
    if (this.upstreamConfig.sendTargetDL) {
      para.targetDeadline = this.upstreamConfig.sendTargetDL;
    }
    const miningInfo = new MiningInfo(para.height, para.baseTarget, para.generationSignature, para.targetDeadline);

    if (this.miningInfo && this.miningInfo.height === miningInfo.height && this.miningInfo.baseTarget === miningInfo.baseTarget) {
      return;
    }

    // save some stats for later
    const isFork = miningInfo.height === this.miningInfo.height && miningInfo.baseTarget !== this.miningInfo.baseTarget;
    const lastBlockHeight = this.miningInfo.height;
    const lastBaseTarget = this.miningInfo.baseTarget;
    const lastNetDiff = this.miningInfo.netDiff;
    const bestDL = this.getBestDL();
    const bestDLSubmitted = bestDL ? (bestDL.isLessThanOrEqualTo(this.upstreamConfig.targetDL)) ? bestDL : null : null;
    const accountIds = Object.keys(this.deadlines);

    this.roundStart = new Date();
    this.miningInfo = miningInfo;
    this.emit('new-round', miningInfo);
    this.deadlines = {};
    eventBus.publish('stats/current-round', this.fullUpstreamName, this.getCurrentRoundStats());
    let newBlockLine = `${this.fullUpstreamNameLogs} | ${outputUtil.getString(`New block ${outputUtil.getString(miningInfo.height, this.newBlockColor)}, baseTarget ${outputUtil.getString(miningInfo.baseTarget, this.newBlockBaseTargetColor)}, netDiff ${outputUtil.getString(miningInfo.netDiff.toFixed(0) + ' TB', this.newBlockNetDiffColor)}`, this.newBlockLineColor)}`;
    if (miningInfo.targetDeadline) {
      newBlockLine += outputUtil.getString(`, targetDeadline: ${outputUtil.getString(miningInfo.targetDeadline, this.newBlockTargetDeadlineColor)}`, this.newBlockLineColor);
    }
    eventBus.publish('log/info', newBlockLine);

    if (isFork) {
      return;
    }

    if (lastBlockHeight !== 0) {
      // Add historical, but wait some time till the wallet has caught up
      await new Promise(resolve => setTimeout(resolve, 7 * 1000));
      const lastBlockWinner = await this.getBlockWinnerAccountId(lastBlockHeight);
      const roundWon = lastBlockWinner === null ? null : accountIds.some(accountId => accountId === lastBlockWinner);

      await database().round.create({
        upstream: this.fullUpstreamName,
        blockHeight: lastBlockHeight,
        baseTarget: lastBaseTarget,
        netDiff: lastNetDiff,
        bestDL: bestDL ? bestDL.toString() : null,
        bestDLSubmitted: bestDLSubmitted ? bestDLSubmitted.toString() : null,
        roundWon,
      });
    }

    // Remove old historical
    const toDestroy = await database().round.findAll({
      where: {
        upstream: this.fullUpstreamName,
      },
      order: [
        ['blockHeight', 'DESC'],
      ],
      offset: this.historicalRoundsToKeep,
    });
    await Promise.all(toDestroy.map(row => row.destroy()));

    eventBus.publish('stats/historical', this.fullUpstreamName, await this.getHistoricalStats());
  }

  async submitNonce(submission, minerSoftware, options) {
    const client = this.getClientForAccountId(submission.accountId);
    if (!client) {
      eventBus.publish('log/error', `${this.fullUpstreamNameLogs} | Error: no client configured for accountId ${outputUtil.getString(submission.accountId, this.accountColor)}`);
      return {};
    }

    let minerSoftwareName = this.userAgent;
    if (this.upstreamConfig.sendMiningSoftwareName) {
      minerSoftwareName += ` | ${minerSoftware}`;
    }
    const result = await new Promise(resolve => client.emit('submitNonce', submission.toObject(), {
      minerName: this.upstreamConfig.minerName || hostname(),
      userAgent: minerSoftwareName,
      capacity: this.totalCapacity,
      accountKey: this.upstreamConfig.accountKey,
      payoutAddress: this.upstreamConfig.payoutAddress || this.upstreamConfig.accountKey,
      maxScanTime: this.upstreamConfig.maxScanTime,
      minerAlias: this.upstreamConfig.minerAlias || options.minerAlias || null,
    }, resolve));

    return {
      error: null,
      result,
    };
  }

  getClientForAccountId(accountId) {
    if (!accountId) {
      return this.client;
    }

    if (this.clients[accountId]) {
      return this.clients[accountId];
    }

    return this.client;
  }

  getUpstreamUrlMappings() {
    const urlMappings = new Map();
    if (this.upstreamConfig.urlForAccountId) {
      Object.keys(this.upstreamConfig.urlForAccountId).forEach(accountId => {
        const url = this.upstreamConfig.urlForAccountId[accountId];
        let urlMapping = {
          accountIds: [],
          url,
        };
        if (urlMappings.get(url)) {
          urlMapping = urlMappings.get(url);
        }
        urlMapping.accountIds.push(accountId);

        urlMappings.set(url, urlMapping);
      });
    }
    if (this.upstreamConfig.url && !this.upstreamConfig.allAccountIdsConfigured) {
      const url = this.upstreamConfig.url;
      let urlMapping = {
        accountIds: [],
        url,
      };
      if (urlMappings.get(url)) {
        urlMapping = urlMappings.get(url);
      }

      urlMappings.set(url, urlMapping);
    }

    return urlMappings;
  }

  async getBlockWinnerAccountId(height) {
    if (!this.upstreamConfig.walletUrl) {
      // Wait for block winner info up to 30 sec
      return new Promise(resolve => {
        let resolved = false;
        let timeout = setTimeout(() => {
          if (resolved) {
            return;
          }
          resolve(null);
        }, 30 * 1000);
        this.client.emit('getBlockWinnerAccountId', height, accountId => {
          if (resolved) {
            return;
          }
          clearTimeout(timeout);
          resolved = true;
          resolve(accountId);
        });
      });
    }

    return util.getBlockWinnerAccountId(this.upstreamConfig.walletUrl, this.isBHD, height, this.upstreamConfig.customEndpoint);
  }

  getMiningInfo() {
    return this.miningInfo.toObject();
  }

  recalculateTotalCapacity() {
    super.recalculateTotalCapacity();
    if (this.client) {
      this.client.capacity = this.totalCapacity;
    }
  }
}

module.exports = SocketIo;