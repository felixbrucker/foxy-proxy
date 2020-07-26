1.35.2 / 2020-07-26
==================

* Fix obscure connection issues with the miner-gateway and websocket transports

1.35.1 / 2020-04-16
==================

* Fix self signed certificate connections with postgres

1.35.0 / 2020-04-15
==================

* Add upstream config option `minerPassthrough`
* Remove hpool upstream type

1.34.3 / 2020-04-15
==================

* Fix "SQLITE_BUSY" errors
* Update all the dependencies

1.34.2 / 2020-04-04
==================

* Favor configured weight over profitability based weight

1.34.1 / 2020-04-03
==================

* Fallback to regular foxy-pool connection if no coin set

1.34.0 / 2020-04-03
==================

* Add support for single connection foxy-pool upstreams which do not require an url to be configured
* Add support for node 12
* Use `x-forwarded-for` header as ip if present
* Drop grpc support
* Update all the dependencies

1.33.0 / 2019-10-17
==================

* Allow setting distributionRatio via a config option for foxy-pools.
* Prevent an error when setting `submitProbability` greater or equal to 100%
* Fix netDiff and EC for BHD.

1.32.0 / 2019-10-07
==================

* Drop hdpool support.
* Add support for HDD.
* Show the dynamic targetDL when using `submitProbability` in debug log.
* Remove `Foxy-Proxy` prefix from miner name.
* Auto remove trailing slash in foxypool url if detected.
* Fix LHD EC calculation.
* Fix BHD rate for profitability based switching.
* Fix dynamic TargetDL for LHD.

1.31.0 / 2019-09-07
==================

* Add support for LHD mining on hdpool.
* Fix "new" backwards incompatible mining api of hdpool.

1.30.0 / 2019-09-05
==================

**Note**: this release includes updated native modules, please install it manually

* Add config switch to toggle full/eco block rewards for profitability calculation.
* Add LHD to profitability calculation.
* Adapt profitability calculation to use new BHD block rewards.
* Show netDiff formatted in the cli.
* Fix wallet responses with big numbers.

1.29.2 / 2019-08-24
==================

* Fix submit probability capacity calculation.

1.29.1 / 2019-08-23
==================

* Hopefully fix sqlite timeout errors on super slow systems.

1.29.0 / 2019-08-22
==================

* Add disc profitability data based on otc.poolx.com.
* Fix possible sqlite database lock issues.

1.28.0 / 2019-08-21
==================

**Note**: this release includes updated native modules, please install it manually on windows

* Add support for excluding accountIds per upstream.
* Add LHD explorer links.
* Add debug log line for proxy switches.
* Add proxy and upstream colors to the cli dashboard.
* Show an error when submitting solo submissions to pool upstreams.
* Show fallback weight in case of no profitability data.
* Fix HDPool showing as not connected in the web-ui.
* Fix possible race condition when persisting rounds.
* Remove system details from usage statistics.

1.27.1 / 2019-07-26
==================

* Fix special snowflake chinese pool height compares.

1.27.0 / 2019-07-25
==================

* Add support for multi coin block explorer links (via `coin` option).
* Add support for mismatching height and deadline detection.
* Add support for BOOM rates.
* Add support for self-signed certificates for mail transports.
* Add support for special snowflake pool "poolx".
* Automatically add '/mining' to Foxy-Pool URLs if missing.
* Fix logLevel being ignored for file logging.
* Fix solo mining wallet error not shown correctly for BURST wallets and similar.
* Fix submitted deadlines not persisted with `submitProbability` option.
* Fix data dir not created with local config.yaml present.
* Fix docker images including git dir.

1.26.0 / 2019-07-05
==================

* Add support for maxNumberOfChains.
* Add support for block winner accountId retrieval through socket.io
* Fix debug message on failed latest version checks.

1.25.0 / 2019-07-02
==================

* Add support for manual updates through the web ui via update button.
* Fix retrieval of latest releases from github.
* Rename prio to weight in config to clarify precedence. 

1.24.0 / 2019-07-02
==================

* Add support for per miner and accountId colors.
* Add support for showing all deadlines received.
* Add support for disabling proxies and upstreams.
* Add support for dynamic prio's based on profitability.
* Add support for BRS >= 2.4.0 grpc api.
* Remove support for BRS < 2.4.0 grpc api.
* Remove support for sending all deadlines received.
* Fix displaying of errors from BURST or BOOM wallets in the log.
* Fix waiting for miningInfo on startup for socket.io based upstreams.

1.23.0 / 2019-06-25
==================

* Add support for custom estimated capacity intervals.
* Encode minerName and minerAlias if UTF-8 symbols are detected for http upstreams.
* Increase block winner retrieval retries.
* Fix dynamic deadline color for very low deadlines.

1.22.0 / 2019-06-04
==================

* Add support for multiple transports concurrently.
* Add support for socket.io transport for Foxy-Miner.
* Add support for minerAlias header/option.
* Add support for dynamic EC calculation.

1.21.0 / 2019-05-30
==================

* Improve self updating through git.
* Add support for humanized DL formatting in the cli log.
* Allow hiding the upstream name in the cli log.
* Add support for dynamic DL colors.
* Update the web-ui to angular 8 for improved performance.
* Fix possibly outdated miningInfo after reconnecting through socket.io.
* Fix web-ui showing the old version after updating without refreshing it.

1.20.0 / 2019-05-27
==================

* Add support for FoxyPool's socket.io protocol for faster retrieval of new round info.
* Fix `--help` cli option.

1.19.1 / 2019-05-25
==================

* Fix duplicate delete of old database file.

1.19.0 / 2019-05-25
==================

* Allow overriding miner offline detection options.
* Add web ui settings page.
* Add startup ascii art.
* Rename all the things to Foxy-Proxy.

1.18.0 / 2019-05-19
==================

* Add support for updating the proxy through the web ui.
* Add support for automatically updating the proxy on new versions.
* Aggregate all new versions changelogs in the web ui.
* Add anonymous usage statistics.
* Allow customizing the color of many elements in the cli log.

1.17.0 / 2019-05-17
==================

* Add console color support.

1.16.2 / 2019-05-17
==================

* Remove deprecated HDPool fallback endpoints.

1.16.1 / 2019-05-17
==================

* Fix a bug that prevented 0 sec deadlines on HDPool to be submitted.
* Show the running version in the web ui.
* Add the changelog to new version notifications in the web ui.

1.16.0 / 2019-05-11
==================

* Add support for miner offline/recovered mail notifications.
* Auto-scale netDiff web ui chart.
* Increase timeouts for crappy slow chinese pools.
* Allow changing the hpool url.

1.15.2 / 2019-05-07
==================

* Fix possibly outdated miningInfo after hdpool reconnects.

1.15.1 / 2019-04-30
==================

* Make current round stats bigger in the WebUI.
* File logging is now enabled by default for new installs.
* Possibly fix performance issues with unreliable/offline upstreams.
* Fix startup waiting for offline upstreams.
* Fix broken WebUI when an upstream never acquired miningInfo.
* Reduce the info logging noise for flaky upstreams where some getMiningInfo requests timeout regularly.

1.15.0 / 2019-04-27
==================

* Add support for HPools miner status upload.
* HPool now has its own type for simplified configs.

1.14.1 / 2019-04-26
==================

* Fix the web ui on ancient browsers.

1.14.0 / 2019-04-25
==================

* Add support for hdpools eco pool.

1.13.1 / 2019-04-22
==================

* Mark HDPool as online again after reconnecting.

1.13.0 / 2019-04-21
==================

* Add automatic HDPool fallback to ali3 and ali4.
* Support big miners with capacities of up to 8 YiB.
* Update all the dependencies.

1.12.0 / 2019-03-31
==================

* Add per upstream connection quality indicators to the web ui.
* Improve the display and selection of proxies in the web ui for small screens.
* Show the exact pool/wallets error messages in the log.
* Retry fetching the last round won info up to 10 times for slowly syncing wallets.
* Add historical stats (round won) update via startup flag.
* Update all the dependencies.

1.11.1 / 2019-03-21
==================

* Fix a bug which prevented the usage of postgres databases for stats.

1.11.0 / 2019-03-21
==================

* Add config validations.
* Fix the capacity not displayed correctly on hpool without deadline submits.
* Use new tld for burst block explorer links.
* Allow setting the passphrase in the miner when solo mining Burst.
* Make it possible to run the proxy in Heroku, and possibly other cloud services.
* Update all the dependencies.

1.10.0 / 2019-03-05
==================

* Detect forks and update miningInfo accordingly.

1.9.0 / 2019-03-05
==================

* Officially support Burst's v2 API via `burst-grpc` type. See config examples on how to configure.

1.8.4 / 2019-03-01
==================

* Fixes a bug which could have prevented the catch-all web ui route from working for npm installs.

1.8.3 / 2019-03-01
==================

* Fixes a bug which could have prevented the catch-all web ui route from working for npm installs.

1.8.2 / 2019-02-26
==================

* Capture some errors which were previously not captured

1.8.1 / 2019-02-26
==================

* Catch config errors

1.8.0 / 2019-02-26
==================

* Add log level support
* Add file logging support
* Add automatic error reporting

1.7.3 / 2019-02-23
==================

* Use hdpool-api package
* Update dependencies

1.7.2 / 2019-02-19
==================

* Fix default currentRoundManager not found

1.7.1 / 2019-02-19
==================

* Fix first proxy selected after reconnect

1.7.0 / 2019-02-19
==================

* Add update notification in the web ui on new versions
* Add update notification log line on startup on new versions
* Add web ui logout button
* Add web ui connection notifications
* Allow hiding more cards
* Fix spacing for long miner and upstream names
* Fix upstream scan progress for low default proxy maxScanTimes

1.6.2 / 2019-02-18
==================

* Improve overall performance especially with many proxies
* Add web ui support for IE
* Fix web ui authentication over http for chrome

1.6.1 / 2019-02-17
==================

* Use 'explorer.burstcoin.dk' for burst blocks
* Fix stats not updating after login

1.6.0 / 2019-02-17
==================

* Add authentication to the web ui
* Add blocks won to the web ui
* Allow hiding blocks won in the web ui

1.5.3 / 2019-02-15
==================

* Add per upstream scan progress
* Use dark theme everywhere

1.5.2 / 2019-02-15
==================

* Fix historical difficulty display on mobile

1.5.1 / 2019-02-14
==================

* Add miner status indicator (web ui)

1.5.0 / 2019-02-14
==================

* Add a web ui

1.4.1 / 2019-02-09
==================

* Fix plot size in cli ui

1.4.0 / 2019-02-09
==================

* Add basic cli ui
* Add docker support

1.3.0 / 2019-02-09
==================

* Allow custom config and db file paths via cli parameters
* Fix pm2 ecosystem.config.js watch ignore for new db file path
* Bump dependencies
