<img align="right" height="120" src="./app/src/assets/fox.svg">

Foxy-Proxy
======

[![Software License](https://img.shields.io/badge/license-GPL--3.0-brightgreen.svg?style=flat-square)](LICENSE)
[![npm](https://img.shields.io/npm/v/foxy-proxy.svg?style=flat-square)](https://www.npmjs.com/package/foxy-proxy)
[![npm weekly downloads](https://img.shields.io/npm/dw/foxy-proxy.svg?style=flat-square)](https://www.npmjs.com/package/foxy-proxy)
[![docker pulls](https://img.shields.io/docker/pulls/felixbrucker/foxy-proxy.svg?style=flat-square)](https://hub.docker.com/r/felixbrucker/foxy-proxy)
[![Discord](https://img.shields.io/discord/582180216747720723.svg?label=Discord&style=flat-square&logo=data:image/png;base64,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)](https://discord.gg/gNHhn9y)

## Prerequisites

- nodejs >= 12, see [here](https://docs.foxypool.io/general/installing-nodejs/) how to install it

## Getting started

If you are unsure on how to proceed check the [Docs](https://docs.foxypool.io/foxy-proxy/).

## Setup

### With npm

```bash
npm i -g foxy-proxy
foxy-proxy
```

### With docker

A docker image based on alpine linux is built automatically on every commit to master as well as on tags.

```bash
latest : Latest master build of the proxy
1.19.0, 1.19, 1 : Version 1.19.0 of the proxy
```

To run the proxy on the fly use:

```bash
docker run --volume /path/to/conf/dir:/conf -p 12345:12345 --name foxy-proxy --rm felixbrucker/foxy-proxy
```

Or set it up via compose as a service:

```bash
version: '2'
services:
  app:
    image: felixbrucker/foxy-proxy
    restart: always
    volumes:
      - /path/to/conf/dir:/conf
    ports:
      - "12345:12345"
```

Be sure to edit the `config.yaml` to listen on `0.0.0.0` for docker.

### With git

```bash
git clone https://github.com/felixbrucker/foxy-proxy
cd foxy-proxy
npm ci
npm start
```

----

This will download the proxy, install its dependencies and setup the default config with some example upstream configs.
Edit the created `config.yaml` file so that your desired proxy/proxies and upstream(s) are configured. More on the valid config options [here](https://docs.foxypool.io/foxy-proxy/configuration/#configuration-options).
Make sure you do not break the yaml format or the file can not be read correctly.

## Updating the proxy

### NPM
When installed via npm just run `npm update -g foxy-proxy`

### Docker
When using docker just pull the latest image or tag you want to update to and replace the running container.
This can be automated via [watchtower](https://github.com/v2tec/watchtower).

### Git
When installed as a git repository just `git pull`.
If the changes have new dependencies required one needs to execute `npm update --no-save` as well before starting the proxy.


## CLI parameters

The proxy can be setup with a custom config and db file path, see `--help` for more info:

```bash
Options:
  -V, --version              output the version number
  --config <config.yaml>     The custom config.yaml file path
  --db <db.sqlite>           The custom db.sqlite file path
  --live                     Show a live dashboard with stats
  --update-historical-stats  Update all historical stats
  --no-colors                Do not use colors in the cli output
  -h, --help                 output usage information
```

## Config example

A config example can be found [here](https://docs.foxypool.io/foxy-proxy/configuration/#configuration-example)

## Running the proxy in production

I personally use pm2 to manage my nodejs based apps. An example ecosystem.config.js has been included. Just `cp ecosystem.config.js.dist ecosystem.config.js`.
Then just use `pm2 start ecosystem.config.js`.
To startup pm2 on boot use `pm2 save` to save the current running config and `pm2 startup` to startup pm2 on boot.
This will only work when installed via git.

Alternatively docker (tag) based deployments with automatic updates through [watchtower](https://github.com/v2tec/watchtower) can be used as well.


## Per miner maxScanTime

To allow fine granular control each miner which supports urls instead of simple ip:port can subscribe to their own maxScanTime. This was tested with scavenger only.  
To do so, just append the preferred maxScanTime in seconds to the url, like so: `http://localhost:12345/burst-bhd/25`. That would result in that miner setting its maxScanTime to 25 seconds.

## Stats

An embedded web ui is available on the `listenAddr` address and port. Alternatively some basic live stats are available via the `--live` cli parameter.

## Donate

- BHD: 33fKEwAHxVwnrhisREFdSNmZkguo76a2ML
- BURST: BURST-BVUD-7VWE-HD7F-6RX4P
- ETH: 0xfEc6F48633A7c557b4ac5c37B4519C55CD701BEF
- BTC: 14rbdLr2YXDkguVaqRKnPftTPX52tnv2x2
- PP: https://www.paypal.me/felixbrucker

## Changelog

A Changelog can be found [here](https://github.com/felixbrucker/foxy-proxy/blob/master/CHANGELOG.md)

## Heroku

One can deploy the proxy to Heroku, though you'll want the config to contain the `ignoreMinerIP` config option per proxy because Heroku assigns each request a different internal ip based on the load balancer route the request took.

[![Deploy](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy)

## License

GNU GPLv3 (see [LICENSE](https://github.com/felixbrucker/foxy-proxy/blob/master/LICENSE))
