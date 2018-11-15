const config = require('@config');

var nextProxy = 0;

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
    getProxy: function () {
        if (nextProxy == config.PROXIES.length)
            nextProxy = 0;
        return config.PROXIES[nextProxy++] + ":8889";
    },
    clear: function () {
        console.log('\033[2J');
    }
};