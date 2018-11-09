var mysql = require('promise-mysql');
const constants = require('@config');

var pools = [];
constants.DATABASE_IPS.forEach(function (currentIP) {
    pools.push(mysql.createPool({
        host: currentIP,
        user: constants.db.DATABASE_USER,
        password: constants.db.DATABASE_PASSWORD,
        database: constants.db.DATABASE_NAME,
        port: constants.db.DATABASE_PORT,
        connectTimeout: 15 * 1000,
        acquireTimeout: 15 * 1000,
        timeout: 15 * 1000,
        multipleStatements: true
    }));
});

exports.getPools = function (singleDB = false) {
    if (singleDB) {
        return [pools[0]];
    } else {
        return pools;
    }
};