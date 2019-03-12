#!/usr/bin/env node

const bodyParser = require('koa-bodyparser');
const http = require('http');
const IO = require('socket.io');
const Koa = require('koa');
const koaStatic = require('koa-static');
const program = require('commander');
const Router = require('koa-router');
const send = require('koa-send');
const Sentry = require('@sentry/node');
const Config = require('./lib/config');
const Dashboard = require('./lib/cli-dashboard');
const database = require('./models');
const eventBus = require('./lib/services/event-bus');
const latestVersionService = require('./lib/services/latest-version-service');
const logger = require('./lib/services/logger');
const Proxy = require('./lib/proxy');
const store = require('./lib/services/store');
const version = require('./lib/version');
const {
  HttpSinglePortTransport,
  HttpMultiplePortsTransport,
  SocketIoTransport,
} = require('./lib/transports');

Sentry.init({
  dsn: 'https://2d4461f632f64ecc99e24c7d88dc1cea@sentry.io/1402474',
  release: `bhd-burst-proxy@${version}`,
});

process.on('unhandledRejection', (err) => {
  eventBus.publish('log/error', `Error: ${err.message}`);
});
process.on('uncaughtException', (err) => {
  eventBus.publish('log/error', `Error: ${err.message}`);
});

program
  .version(version)
  .option('--config <config.yaml>', 'The custom config.yaml file path')
  .option('--db <db.sqlite>', 'The custom db.sqlite file path')
  .option('--live', 'Show a live dashboard with stats')
  .parse(process.argv);

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

store.setLogLevel(config.logLevel || 'info');
store.setLogDir(config.logDir);
if (config.logToFile) {
  logger.enableFileLogging();
}

if (!config.proxies) {
  eventBus.publish('log/error', 'No proxies configured, exiting ..');
  process.exit(1);
}

const proxyConfigs = config.proxies.map(proxyConfig => JSON.parse(JSON.stringify(proxyConfig)));

async function init() {
  // sync() creates missing tables
  await database().sequelize.sync({
    force: false, // Do not drop tables
  });

  const app = new Koa();
  app.on('error', err => {
    eventBus.publish('log/error', `Error: ${err.message}`);
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
  let transport = null;
  if (config.transport === 'http') {
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

  if (config.transport === 'socket.io') {
    transport = new SocketIoTransport(io, config.listenAddr);
    transport.addProxies(proxies);
  }

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
      runningVersion: version,
    }));
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

  eventBus.subscribe('stats/historical', (upstreamName, historicalStats) => {
    const clients = Object.keys(authenticatedClients).map(id => authenticatedClients[id]);
    clients.forEach(client => client.emit('stats/historical', upstreamName, historicalStats));
  });

  store.setProxies(proxies);

  eventBus.publish('log/info', `BHD-Burst-Proxy ${version} initialized. The WebUI is reachable on http://${config.listenAddr}`);
  if (dashboard) {
    await dashboard.initStats();
  }

  await latestVersionService.init();
  const latestVersion = latestVersionService.getLatestVersion();
  if (latestVersion && latestVersion !== version) {
    eventBus.publish('log/info', `Newer version ${latestVersion} is available!`);
  }
}

init();
