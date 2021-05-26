const bodyParser = require('koa-bodyparser');
const chalk = require('chalk');
const http = require('http');
const Integrations = require('@sentry/integrations');
const IO = require('socket.io');
const Koa = require('koa');
const staticCache = require('koa-static-cache');
const program = require('commander');
const Router = require('koa-router');
const send = require('koa-send');
const Sentry = require('@sentry/node');
const { flatten } = require('lodash');
const { arch, platform, release } = require('os');

const Config = require('./lib/config');
const Dashboard = require('./lib/cli-dashboard');
const database = require('./models');
const eventBus = require('./lib/services/event-bus');
const latestVersionService = require('./lib/services/latest-version-service');
const selfUpdateService = require('./lib/services/self-update-service');
const logger = require('./lib/services/logger');
const Proxy = require('./lib/proxy');
const store = require('./lib/services/store');
const mailService = require('./lib/services/mail-service');
const profitabilityService = require('./lib/services/profitability-service');
const version = require('./lib/version');
const usageStatisticsService = require('./lib/services/usage-statistics-service');
const foxyPoolGateway = require('./lib/services/foxy-pool-gateway');
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
  .option('--no-colors', 'Do not use colors in the cli output')
  .parse(process.argv);

const programOptions = program.opts();
if (!programOptions.colors) {
  store.setUseColors(false);
}
startupMessage();

if (programOptions.config) {
  store.setConfigFilePath(programOptions.config);
}
if (programOptions.db) {
  store.setDbFilePath(programOptions.db);
}
let dashboard = null;
if (programOptions.live) {
  store.setUseLiveDashboard(true);
  dashboard = new Dashboard();
  dashboard.start();
}

const config = new Config();

if (dashboard && config.config.dashboardLogLines) {
  dashboard.maxLogLines = config.config.dashboardLogLines;
}

Sentry.init({
  dsn: 'https://2d4461f632f64ecc99e24c7d88dc1cea@sentry.io/1402474',
  release: `Foxy-Proxy@${version}`,
  integrations: [
    new Integrations.Dedupe(),
    new Integrations.ExtraErrorData(),
    new Integrations.Transaction(),
  ],
  ignoreErrors: [
    /ENOSYS/,
    /SequelizeUniqueConstraintError/,
    /SQLITE_BUSY/,
    /Please install sqlite3 package manually/,
  ],
});

Sentry.configureScope((scope) => {
  scope.setTag('os.arch', arch());
  scope.setTag('os.platform', platform());
  scope.setTag('os.release', release());
});

process.on('unhandledRejection', (err) => {
  eventBus.publish('log/error', `Error: ${err.message}`);
});
process.on('uncaughtException', (err) => {
  eventBus.publish('log/error', `Error: ${err.message}`);
});

store.logging.level = config.logLevel || store.logging.level;
store.logging.dir = config.logDir;
store.logging.maxFiles = config.logMaxFiles;
if (config.logToFile) {
  logger.enableFileLogging();
}
store.setIsInstalledGlobally(!!config.config.isInstalledGlobally);
store.setMailSettings(config.config.mail);
mailService.init();

const proxyConfigs = config.proxies
  .map(proxyConfig => JSON.parse(JSON.stringify(proxyConfig)))
  .map((proxyConfig, index) => ({
    ...proxyConfig,
    index,
  }))
  .filter(proxyConfig => !proxyConfig.disabled);

(async () => {
  // sync() creates missing tables
  await database().sequelize.sync({
    force: false, // Do not drop tables
    alter: true,
  });

  const app = new Koa();
  app.on('error', err => {
    eventBus.publish('log/error', `Error: ${err.message}`);
  });
  app.use(staticCache(`${__dirname}/app/dist`, {
    maxAge: 365 * 24 * 60 * 60, // 1 year
    files: {
      '/index.html' : {
        maxAge: 0,
      },
    },
  }));
  const router = new Router();
  app.use(bodyParser());

  const proxiesWithUpstreams = proxyConfigs.filter(proxyConfig => proxyConfig.upstreams);
  if (proxiesWithUpstreams.length === 0) {
    eventBus.publish('log/error', 'No proxies with upstreams configured, exiting ..');
    process.exit(1);
  }

  if (proxiesWithUpstreams.some(proxyConfig => proxyConfig.useProfitability)) {
    await profitabilityService.init(config.useEcoBlockRewardsForProfitability);
  }

  const coins = [...new Set(flatten(proxiesWithUpstreams.map((proxyConfig) =>
    proxyConfig.upstreams
      .filter(upstreamConfig => !upstreamConfig.disabled)
      .filter(upstreamConfig => upstreamConfig.type === 'foxypool' && upstreamConfig.coin && !upstreamConfig.url)
      .map(upstreamConfig => upstreamConfig.coin.toUpperCase())
  )))];
  if (coins.length > 0) {
    foxyPoolGateway.coins = coins;
    await foxyPoolGateway.init({ allowLongPolling: config.allowLongPolling });
  }

  const proxies = await Promise.all(proxiesWithUpstreams.map(async (proxyConfig) => {
    const proxy = new Proxy(proxyConfig);
    await proxy.init();

    return proxy;
  }));

  if (config.transports.indexOf('http') !== -1) {
    let transport;
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
  const io = IO(server, {
    cors: {
      origin: true,
      methods: ["GET", "POST"],
    },
    allowEIO3: true,
  });

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
})();
