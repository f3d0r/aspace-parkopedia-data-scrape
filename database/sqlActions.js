var db = require('./db');

module.exports = {
    addObjects: function (database, keys, objects) {
        return new Promise(function (resolveAll, rejectAll) {
            var reqs = [];
            if (typeof objects != 'undefined' && objects.length > 0) {
                db.getPools().forEach(function (currentPool) {
                    reqs.push(new Promise(function (resolve, reject) {
                        var sql = `INSERT INTO \`${database}\` (\`` + keys[0] + `\``;
                        for (index = 1; index < keys.length; index++) {
                            sql += ', `' + keys[index] + '` ';
                        }
                        sql += ') VALUES ?; ';
                        currentPool.query(sql, [objects], function (error, results, fields) {
                            if (error)
                                reject(error);
                            else
                                resolve(results);
                        });
                    }));
                });
            }
            Promise.all(reqs)
                .then(function (responses) {
                    resolveAll(responses);
                })
                .catch(function (error) {
                    rejectAll(error);
                });
        });
    },
    runRaw: function (sql, singleDB = false) {
        return new Promise(function (resolveAll, rejectAll) {
            var reqs = [];
            if (sql != "" && typeof sql != 'undefined') {
                db.getPools(singleDB).forEach(function (currentPool) {
                    reqs.push(new Promise(function (resolve, reject) {
                        currentPool.query(sql, function (error, rows) {
                            if (error)
                                reject(error);
                            else
                                resolve(rows);
                        });
                    }));
                });
            }
            Promise.all(reqs)
                .then(function (response) {
                    resolveAll(response);
                }).catch(function (error) {
                    rejectAll(error);
                });
        });
    }
};