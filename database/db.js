var mysql = require('mysql');
const constants = require('@config');

var pools = [];
constants.DATABASE_IPS.forEach(function (currentIP) {
    pools.push(mysql.createPool({
        host: currentIP,
        user: constants.db.DATABASE_USER,
        password: constants.db.DATABASE_PASSWORD,
        database: constants.db.DATABASE_NAME,
        port: constants.db.DATABASE_PORT,
        connectTimeout: 60 * 60 * 1000,
        acquireTimeout: 60 * 60 * 1000,
        timeout: 60 * 60 * 1000,
        multipleStatements: true
    }));
});

exports.getConnections = function () {
    var reqs = [];
    pools.forEach(function (currentPool) {
        reqs.push(new Promise(function (resolve, reject) {
            currentPool.getConnection(function (err, connection) {
                if (err) {
                    reject(err)
                } else {
                    resolve(connection);
                }
            });
        }));
    });
    return Promise.all(reqs);
};