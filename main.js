#!/usr/bin/env node

const bodyParser = require('koa-bodyparser');
const http = require('http');
const IO = require('socket.io');
const json = require('koa-json');
const Koa = require('koa');
const koaStatic = require('koa-static');
const program = require('commander');
const Router = require('koa-router');
const send = require('koa-send');
const Sentry = require('@sentry/node');
const Config = require('./lib/config');
const database = require('./models');
const eventBus = require('./lib/event-bus');
const Proxy = require('./lib/proxy');
const store = require('./lib/store');
const version = require('./lib/version');
const Dashboard = require('./lib/cli-dashboard');
const logger = require('./lib/logger');
const latestVersionService = require('./lib/services/latest-version-service');

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
  app.use(koaStatic(`${__dirname}/app/dist`));
  const router = new Router();
  app.use(json());
  app.use(bodyParser());

  const proxiesWithUpstreams = proxyConfigs.filter(proxyConfig => proxyConfig.upstreams);
  if (proxiesWithUpstreams.length === 0) {
    eventBus.publish('log/error', 'No proxies with upstreams configured, exiting ..');
    process.exit(1);
  }

  const proxies = await Promise.all(proxiesWithUpstreams.map(async (proxyConfig, index) => {
    const proxy = new Proxy(proxyConfig);
    await proxy.init();

    function handleGet(ctx) {
      const maxScanTime = ctx.params.maxScanTime && parseInt(ctx.params.maxScanTime, 10) || null;
      const requestType = ctx.query.requestType;
      switch (requestType) {
        case 'getMiningInfo':
          ctx.body = proxy.getMiningInfo(maxScanTime);
          break;
        default:
          eventBus.publish('log/info', `${proxyConfig.name} | unknown requestType ${requestType} with data: ${JSON.stringify(ctx.params)}. Please message this info to the creator of this software.`);
          ctx.status = 400;
          ctx.body = {
            error: {
              message: 'unknown request type',
              code: 4,
            },
          };
      }
    }

    async function handlePost(ctx) {
      const maxScanTime = ctx.params.maxScanTime && parseInt(ctx.params.maxScanTime, 10) || null;
      const requestType = ctx.query.requestType;
      switch (requestType) {
        case 'getMiningInfo':
          ctx.body = proxy.getMiningInfo(maxScanTime);
          break;
        case 'submitNonce':
          await proxy.handleSubmitNonce(ctx);
          break;
        default:
          eventBus.publish('log/info', `${proxyConfig.name} | unknown requestType ${requestType} with data: ${JSON.stringify(ctx.params)}. Please message this info to the creator of this software.`);
          ctx.status = 400;
          ctx.body = {
            error: {
              message: 'unknown request type',
              code: 4,
            },
          };
      }
    }

    const result = {
      proxy,
    };

    let endpoint;
    let listenAddr = config.listenAddr;
    if (config.useMultiplePorts) {
      const localApp = new Koa();
      const localRouter = new Router();
      localApp.use(json());
      localApp.use(bodyParser());
      endpoint = '';
      const endpointWithScanTime = '/:maxScanTime';
      localRouter.get(`${endpoint}/burst`, handleGet);
      localRouter.post(`${endpoint}/burst`, handlePost);
      localRouter.get(`${endpointWithScanTime}/burst`, handleGet);
      localRouter.post(`${endpointWithScanTime}/burst`, handlePost);
      localApp.use(localRouter.routes());
      localApp.use(localRouter.allowedMethods());
      const localServer = http.createServer(localApp.callback());
      const listenPort = config.listenPort + index + 1;
      listenAddr = `${config.listenHost}:${listenPort}`;
      localServer.listen(listenPort, config.listenHost);
      result.server = localServer;
    } else {
      endpoint = `/${encodeURIComponent(proxyConfig.name.toLowerCase().replace(/ /g, '-'))}`;
      const endpointWithScanTime = `${endpoint}/:maxScanTime`;
      router.get(`${endpoint}/burst`, handleGet);
      router.post(`${endpoint}/burst`, handlePost);
      router.get(`${endpointWithScanTime}/burst`, handleGet);
      router.post(`${endpointWithScanTime}/burst`, handlePost);
    }

    eventBus.publish('log/info', `${proxyConfig.name} | Proxy configured and reachable via http://${listenAddr}${endpoint}`);

    return result;
  }));

  app.use(router.routes());
  app.use(router.allowedMethods());

  // redirect everything else to index.html
  app.use(async ctx => {
    await send(ctx, 'app/dist/index.html');
  });

  const server = http.createServer(app.callback());
  const io = IO(server);
  server.listen(config.listenPort, config.listenHost);

  const authenticatedClients = {};
  io.on('connection', async client => {
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
      const stats = await Promise.all(proxies.map(({proxy}) => proxy.getStats()));
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
