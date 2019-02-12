#!/usr/bin/env node

const bodyParser = require('koa-bodyparser');
const http = require('http');
const IO = require('socket.io');
const json = require('koa-json');
const Koa = require('koa');
const program = require('commander');
const Router = require('koa-router');
const Config = require('./lib/config');
const database = require('./models');
const eventBus = require('./lib/event-bus');
const Proxy = require('./lib/proxy');
const store = require('./lib/store');
const version = require('./lib/version');
const Dashboard = require('./lib/cli-dashboard');
const logger = require('./lib/logger');

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
if (program.live) {
  store.setUseLiveDashboard(true);
  const dashboard = new Dashboard();
  dashboard.start();
}

const config = new Config();

const proxyConfigs = config.proxies.map(proxyConfig => JSON.parse(JSON.stringify(proxyConfig)));

async function init() {
  // sync() creates missing tables
  await database().sequelize.sync({
    force: false, // Do not drop tables
  });

  const app = new Koa();
  const router = new Router();
  app.use(json());
  app.use(bodyParser());

  const proxies = await Promise.all(proxyConfigs.map(async (proxyConfig, index) => {
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

  const server = http.createServer(app.callback());
  const io = IO(server);
  server.listen(config.listenPort, config.listenHost);

  io.on('connection', async client => {
    const stats = await Promise.all(proxies.map(({proxy}) => proxy.getStats()));
    client.emit('stats', stats);
    client.on('stats/get', async () => {
      const stats = await Promise.all(proxies.map(({proxy}) => proxy.getStats()));
      client.emit('stats/init', stats);
    });
  });

  eventBus.subscribe('stats/new', async () => {
    const connections = Object.keys(io.sockets.connected).length;
    if (connections === 0) {
      return;
    }
    const stats = await Promise.all(proxies.map(({proxy}) => proxy.getStats()));
    io.emit('stats', stats);
  });

  eventBus.subscribe('stats/proxy', (proxyName, proxyStats) => {
    io.emit('stats/proxy', proxyName, proxyStats);
  });

  eventBus.subscribe('stats/current-round', (upstreamName, currentRoundStats) => {
    io.emit('stats/current-round', upstreamName, currentRoundStats);
  });

  eventBus.subscribe('stats/historical', (upstreamName, historicalStats) => {
    io.emit('stats/historical', upstreamName, historicalStats);
  });

  store.setProxies(proxies);

  eventBus.publish('log/info', `BHD-Burst-Proxy ${version} initialized`);
  eventBus.publish('stats/new');
}

init();
