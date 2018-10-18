var db = require('./db');

module.exports = {
    addObjects: function (database, keys, objects) {
        return new Promise(function (resolveAll, rejectAll) {
            db.getConnections(function (err, connections) {
                var reqs = []
                connections.forEach(function (connection) {
                    reqs.push(new Promise(function (resolve, reject) {
                        var sql = 'INSERT INTO ' + connection.escapeId(database) + ' (`' + keys[0] + '`';
                        for (index = 1; index < keys.length; index++) {
                            sql += ', `' + keys[index] + '` '
                        }
                        sql += ') VALUES ?';
                        connection.query(sql, [objects], function (error, results, fields) {
                            connection.release();
                            if (error) {
                                reject(error);
                            } else {
                                resolve(results);
                            }
                        });
                    }));
                });
                resolveAll(reqs);
            });
        });
    },
    runRaw: function (sql) {
        return new Promise(function(resolveAll, rejectAll) {
            db.getConnections(function (err, connections) {
                var reqs = [];
                connections.forEach(function (connection) {
                    reqs.push(new Promise(function (resolve, reject) {
                        connection.query(sql, function (error, rows) {
                            connection.release();
                            if (error)
                                reject(error);
                            else {
                                resolve(rows);
                            }
                        });
                    }));
                });
                resolveAll(reqs);
            });
        });
    }
}