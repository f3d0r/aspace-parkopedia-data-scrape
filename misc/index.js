const config = require('@config');

module.exports = {
    promiseAllProgress: function (proms, progress_cb) {
        let d = 0;
        progress_cb(0);
        proms.forEach((p) => {
            p.then(() => {
                d++;
                progress_cb((d * 100) / proms.length);
            });
        });
        return Promise.all(proms);
    },
    sleep: function (millis) {
        return new Promise(resolve => setTimeout(resolve, millis));
    },
    getProxy: function (proxies, proxiesUsed) {
        var randomIndex = (getRandomInt(50));
        while (proxiesUsed[randomIndex]) {
            randomIndex = (getRandomInt(50));
        }
        proxiesUsed[randomIndex] = true;
        proxyInfo = proxies[randomIndex].split(":");
        return {
            url: proxyInfo[0] + ":" + proxyInfo[1],
            username: proxyInfo[2],
            password: proxyInfo[3]
        };
    },
    clear: function () {
        console.log('\033[2J');
    }
};

function getRandomInt(max) {
    return Math.floor(Math.random() * Math.floor(max));
}