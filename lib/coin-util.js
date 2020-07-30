const coinUtil = {
    blockTime(coin) {
        switch (coin) {
            case 'BHD':
                return 180;
            case 'LHD':
            case 'HDD':
            case 'XHD':
                return 300;
            default:
                return 240;
        }
    },
    blockZeroBaseTarget(coin) {
        switch (coin) {
            case 'BHD':
                return 24433591728;
            case 'LHD':
            case 'HDD':
            case 'XHD':
                return 14660155037;
            default:
                return 18325193796;
        }
    },
    modifyDeadline(deadline, coin) {
        if (coin !== 'BURST') {
            return deadline;
        }
        if (!deadline) {
            return deadline;
        }

        return Math.floor(Math.log(deadline) * (this.blockTime(coin) / Math.log(this.blockTime(coin))));
    },
    modifyNetDiff(netDiff, coin) {
        if (coin !== 'BURST') {
            return netDiff;
        }

        return Math.round(netDiff / 1.83);
    }
};

module.exports = coinUtil;