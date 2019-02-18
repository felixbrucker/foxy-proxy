const bytes = require('bytes');
const colors = require('colors/safe');
const logUpdate = require('log-update');
const moment = require('moment');
const Table = require('cli-table3');
const eventBus = require('./event-bus');
const store = require('./store');
const version = require('./version');

class Dashboard {
  static getTimeElapsedSinceLastBlock(blockStart) {
    const duration = moment.duration(moment().diff(moment(blockStart)));

    return `${duration.hours().toString().padStart(2, '0')}:${duration.minutes().toString().padStart(2, '0')}:${duration.seconds().toString().padStart(2, '0')}`;
  }

  static getBestDeadlineString(bestDL) {
    if (!bestDL) {
      return 'N/A';
    }
    const duration = moment.duration(parseInt(bestDL, 10), 'seconds');
    if (duration.months() > 0) {
      return `${duration.months()}m ${duration.days()}d ${duration.hours().toString().padStart(2, '0')}:${duration.minutes().toString().padStart(2, '0')}:${duration.seconds().toString().padStart(2, '0')}`;
    } else if (duration.days() > 0) {
      return `${duration.days()}d ${duration.hours().toString().padStart(2, '0')}:${duration.minutes().toString().padStart(2, '0')}:${duration.seconds().toString().padStart(2, '0')}`;
    }

    return `${duration.hours().toString().padStart(2, '0')}:${duration.minutes().toString().padStart(2, '0')}:${duration.seconds().toString().padStart(2, '0')}`;
  };

  constructor() {
    this.maxLogLines = 12;
    this.lastLogLines= [];
    this.proxyStats = [];
    eventBus.subscribe('log/info', (msg) => {
      this.lastLogLines.push(`${moment().format('YYYY-MM-DD HH:mm:ss.SSS')} | ${msg}`);
      if (this.lastLogLines.length > this.maxLogLines) {
        this.lastLogLines = this.lastLogLines.slice(this.maxLogLines * -1);
      }
    });
    eventBus.subscribe('log/error', (msg) => {
      this.lastLogLines.push(colors.red(`${moment().format('YYYY-MM-DD HH:mm:ss.SSS')} | ${msg}`));
      if (this.lastLogLines.length > this.maxLogLines) {
        this.lastLogLines = this.lastLogLines.slice(this.maxLogLines * -1);
      }
    });

    eventBus.subscribe('stats/proxy', this.onNewProxyStats.bind(this));
    eventBus.subscribe('stats/current-round', this.onNewUpstreamStats.bind(this));
    eventBus.subscribe('stats/historical', this.onNewUpstreamStats.bind(this));
  }

  async initStats() {
    this.proxyStats = await Promise.all(store.proxies.map(({proxy}) => proxy.getStats()));
  }

  onNewProxyStats(proxyName, proxyStats) {
    const stats = this.proxyStats;
    if (!stats) {
      return;
    }
    const proxy = stats.find(proxy => proxy.name === proxyName);
    if (!proxy) {
      return;
    }
    Object.keys(proxyStats).forEach(key => {
      proxy[key] = proxyStats[key];
    });
  }

  onNewUpstreamStats(fullUpstreamName, upstreamStats) {
    const stats = this.proxyStats;
    if (!stats) {
      return;
    }
    const upstream = stats
      .map(proxy => proxy.upstreamStats)
      .reduce((acc, curr) => acc.concat(curr), [])
      .find(upstream => upstream.fullName === fullUpstreamName);
    if (!upstream) {
      return;
    }
    Object.keys(upstreamStats).forEach(key => {
      upstream[key] = upstreamStats[key];
    });
  }

  buildTable() {
    const table = new Table({
      head: ['Proxy', 'Upstream', 'Block #', 'NetDiff', 'Elapsed', 'Best DL', 'EC', 'Plot size'],
      style: {
        head: ['cyan'],
      },
    });
    this.proxyStats.map(proxy => {
      return proxy.upstreamStats.map(upstream => {
        table.push([
          proxy.name,
          upstream.name,
          upstream.blockNumber,
          upstream.netDiff ? `${upstream.netDiff.toFixed(0)} TB` : 'N/A',
          Dashboard.getTimeElapsedSinceLastBlock(upstream.roundStart),
          Dashboard.getBestDeadlineString(upstream.bestDL),
          upstream.estimatedCapacityInTB ? bytes(upstream.estimatedCapacityInTB * Math.pow(1024, 4)) : 'N/A',
          proxy.totalCapacity ? bytes(proxy.totalCapacity) : 'N/A',
        ]);
      });
    });

    return table.toString();
  }

  buildLogs() {
    return this.lastLogLines.join('\n');
  }

  render() {
    logUpdate([
      colors.bold.magenta(`BHD-Burst-Proxy ${version}`),
      this.buildTable(),
      '',
      'Last log lines:',
      this.buildLogs(),
    ].join('\n'));
  }

  start() {
    this.render();
    this.timer = setInterval(this.render.bind(this), 1000);
  }

  stop() {
    clearInterval(this.timer);
  }
}

module.exports = Dashboard;
