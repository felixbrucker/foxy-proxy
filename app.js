const bodyParser = require('koa-bodyparser');
const chalk = require('chalk');
const http = require('http');
const Integrations = require('@sentry/integrations');
const IO = require('socket.io');
const Koa = require('koa');
const koaStatic = require('koa-static');
const program = require('commander');
const Router = require('koa-router');
const send = require('koa-send');
const Sentry = require('@sentry/node');
const blacklistedErrors = require('./lib/blacklisted-errors');
const Config = require('./lib/config');
const Dashboard = require('./lib/cli-dashboard');
const database = require('./models');
const eventBus = require('./lib/services/event-bus');
const historicalStatsUpdater = require('./lib/services/historical-stats-udater');
const latestVersionService = require('./lib/services/latest-version-service');
const selfUpdateService = require('./lib/services/self-update-service');
const logger = require('./lib/services/logger');
const Proxy = require('./lib/proxy');
const store = require('./lib/services/store');
const mailService = require('./lib/services/mail-service');
const version = require('./lib/version');
const usageStatisticsService = require('./lib/services/usage-statistics-service');
const startupMessage = require('./lib/startup-message');
const {
  HttpSinglePortTransport,
  HttpMultiplePortsTransport,
  SocketIoTransport,
} = require('./lib/transports');

program
  .version(version)
  .option('--config <config.yaml>', 'The custom config.yaml file path')
  .option('--db <db.sqlite>', 'The custom db.sqlite file path')
  .option('--live', 'Show a live dashboard with stats')
  .option('--update-historical-stats', 'Update all historical stats')
  .option('--no-colors', 'Do not use colors in the cli output')
  .parse(process.argv);

if (program.noColors) {
  store.setUseColors(false);
}
startupMessage();

if (program.config) {
  store.setConfigFilePath(program.config);
}
if (program.db) {
  store.setDbFilePath(program.db);
}
let dashboard = null;
if (program.live) {
  store.setUseLiveDashboard(true);
  dashboard = new Dashboard();
  dashboard.start();
}

const config = new Config();

Sentry.init({
  dsn: 'https://2d4461f632f64ecc99e24c7d88dc1cea@sentry.io/1402474',
  release: `foxy-proxy@${version}`,
  attachStacktrace: true,
  integrations: [
    new Integrations.Dedupe(),
    new Integrations.ExtraErrorData(),
    new Integrations.Transaction(),
  ],
});

process.on('unhandledRejection', (err) => {
  eventBus.publish('log/error', `Error: ${err.message}`);
});
process.on('uncaughtException', (err) => {
  eventBus.publish('log/error', `Error: ${err.message}`);
});

store.setLogLevel(config.logLevel || 'info');
store.setLogDir(config.logDir);
if (config.logToFile) {
  logger.enableFileLogging();
}
store.setIsInstalledGlobally(!!config.config.isInstalledGlobally);
store.setMailSettings(config.config.mail);
mailService.init();

const proxyConfigs = config.proxies.map(proxyConfig => JSON.parse(JSON.stringify(proxyConfig)));

(async () => {
  // sync() creates missing tables
  await database().sequelize.sync({
    force: false, // Do not drop tables
    alter: true,
  });

  const app = new Koa();
  app.on('error', err => {
    eventBus.publish('log/error', `Error: ${err.message}`);
    if (blacklistedErrors.indexOf(err.message) !== -1) {
      return;
    }
    Sentry.captureException(err);
  });
  app.use(koaStatic(`${__dirname}/app/dist`));
  const router = new Router();
  app.use(bodyParser());

  const proxiesWithUpstreams = proxyConfigs.filter(proxyConfig => proxyConfig.upstreams);
  if (proxiesWithUpstreams.length === 0) {
    eventBus.publish('log/error', 'No proxies with upstreams configured, exiting ..');
    process.exit(1);
  }

  const proxies = await Promise.all(proxiesWithUpstreams.map(async (proxyConfig) => {
    const proxy = new Proxy(proxyConfig);
    await proxy.init();

    return proxy;
  }));

  if (config.transports.indexOf('http') !== -1) {
    let transport = null;
    if (config.useMultiplePorts) {
      transport = new HttpMultiplePortsTransport(config.listenHost, config.listenPort);
    } else {
      transport = new HttpSinglePortTransport(router, config.listenAddr);
    }
    transport.addProxies(proxies);
  }

  app.use(router.routes());
  app.use(router.allowedMethods());

  // redirect everything else to index.html
  app.use(async ctx => {
    await send(ctx, 'app/dist/index.html', {
      root: __dirname,
    });
  });

  const server = http.createServer(app.callback());
  const io = IO(server);

  if (config.transports.indexOf('socket.io') !== -1) {
    const transport = new SocketIoTransport(io, config.listenAddr);
    transport.addProxies(proxies);
  }

  server.on('error', (err) => {
    eventBus.publish('log/error', `Error: ${err.message}`);
    if (err.code === 'EADDRINUSE' || err.code === 'EACCES') {
      process.exit(1);
    }
  });

  server.listen(config.listenPort, config.listenHost);

  const authenticatedClients = {};
  const webUiSocketIo = io.of('web-ui');
  webUiSocketIo.on('connection', async client => {
    let authenticated = !config.webAuth; // Without any auth set, allow all
    if (authenticated) {
      authenticatedClients[client.id] = client;
    }
    client.on('authenticate', ({username, passHash}, cb) => {
      if (authenticated) {
        cb(true);
        return;
      }

      if (username === config.webAuth.username && passHash === config.webAuth.passHash) {
        authenticatedClients[client.id] = client;
        authenticated = true;
      }

      cb(authenticated);
    });
    client.on('stats/init', async (cb) => {
      if (!authenticated) {
        client.emit('unauthorized');
        return;
      }
      const stats = await Promise.all(proxies.map((proxy) => proxy.getStats()));
      cb(stats);
    });
    client.on('version/info', (cb) => cb({
      latestVersion: latestVersionService.getLatestVersion(),
      changelog: latestVersionService.getChangelog(),
      runningVersion: version,
    }));
    client.on('version/update', () => {
      if (!authenticated) {
        client.emit('unauthorized');
        return;
      }
      eventBus.publish('version/update');
    });
    client.on('disconnect', () => {
      if (!authenticatedClients[client.id]) {
        return;
      }
      delete authenticatedClients[client.id];
    });
  });

  eventBus.subscribe('stats/proxy', (proxyName, proxyStats) => {
    const clients = Object.keys(authenticatedClients).map(id => authenticatedClients[id]);
    clients.forEach(client => client.emit('stats/proxy', proxyName, proxyStats));
  });

  eventBus.subscribe('stats/current-round', (upstreamName, currentRoundStats) => {
    const clients = Object.keys(authenticatedClients).map(id => authenticatedClients[id]);
    clients.forEach(client => client.emit('stats/current-round', upstreamName, currentRoundStats));
  });

  eventBus.subscribe('stats/connection-stats', (upstreamName, connectionStats) => {
    const clients = Object.keys(authenticatedClients).map(id => authenticatedClients[id]);
    clients.forEach(client => client.emit('stats/connection-stats', upstreamName, connectionStats));
  });

  eventBus.subscribe('stats/historical', (upstreamName, historicalStats) => {
    const clients = Object.keys(authenticatedClients).map(id => authenticatedClients[id]);
    clients.forEach(client => client.emit('stats/historical', upstreamName, historicalStats));
  });

  store.setProxies(proxies);

  const startupLine = `Foxy-Proxy ${version} initialized. The WebUI is reachable on http://${config.listenAddr}`;
  eventBus.publish('log/info', store.getUseColors() ? chalk.green(startupLine) : startupLine);
  if (dashboard) {
    await dashboard.initStats();
  }

  eventBus.subscribe('version/new', newVersion => {
    const newVersionLine = `Newer version ${newVersion} is available!`;
    eventBus.publish('log/info', store.getUseColors() ? chalk.magentaBright(newVersionLine) : newVersionLine);
    if (!config.config.automaticUpdates) {
      return;
    }
    eventBus.publish('version/update');
  });
  await latestVersionService.init();

  if (!config.config.disableAnonymousStatistics) {
    await usageStatisticsService.init();
  }

  if (program.updateHistoricalStats) {
    eventBus.publish('log/info', 'Waiting 60 seconds for miners to submit nonces so we know all account ids before ' +
        'updating all historical stats ..');
    await new Promise(resolve => setTimeout(resolve, 60 * 1000));
    await historicalStatsUpdater.updateHistoricalStats(proxies, true);
  } else {
    await new Promise(resolve => setTimeout(resolve, 60 * 1000));
    await historicalStatsUpdater.updateHistoricalStats(proxies);
  }
})();
