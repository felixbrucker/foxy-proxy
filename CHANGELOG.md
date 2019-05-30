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
