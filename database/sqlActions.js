var db = require('./db');
var mysql = require('mysql');

module.exports = {
    addObjects: function (database, keys, objects, successCB, failCB) {
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
            Promise.all(reqs)
                .then(function (results) {
                    successCB(results);
                })
                .catch(function (error) {
                    failCB(error);
                });
        });
    },
    runRaw: function (sql, successCB, failCB) {
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
            Promise.all(reqs)
                .then(function (rows) {
                    successCB(rows);
                })
                .catch(function (error) {
                    failCB(error);
                });
        });
    }
}