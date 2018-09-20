var db = require('./db');
var mysql = require('mysql');

module.exports = {
    insert: {
        addObjects: function (database, keys, objects, successCB, failCB) {
            db.getConnection(function (err, connection) {
                var sql = 'INSERT INTO ' + connection.escapeId(database) + ' (`' + keys[0] + '`';
                for (index = 1; index < keys.length; index++) {
                    sql += ', `' + keys[index] + '` '
                }
                sql += ') VALUES ?';
                console.log("MYSQL QUERY: " + mysql.format(sql, [objects]));
                connection.query(sql, [objects], function (error, results, fields) {
                    if (error) {
                        return failCB(error);
                    } else {
                        successCB(results);
                    }
                });
                connection.release();
            });
        },
    },
    select: {
        regularSelect: function (database, selection, keys, operators, values, numResults, successCB, noneFoundCB, failCB) {
            db.getConnection(function (err, connection) {
                var sql = 'SELECT ';
                if (selection == null || selection == "*") {
                    sql += '*';
                } else {
                    sql += selection[0] + ' ';
                    for (index = 1; index < selection.length; index++) {
                        sql += ', ' + selection[index]
                    }
                }
                sql += ' FROM ' + connection.escapeId(database) + ' WHERE ';
                if (keys.length != operators.length || operators.length != values.length)
                    return failCB('Key length must match value length.');
                for (var index = 0; index < keys.length; index++) {
                    if (index < keys.length - 1)
                        sql += "`" + keys[index] + "` " + operators[index] + " ? AND ";
                    else
                        sql += "`" + keys[index] + "` " + operators[index] + " ?";
                }
                connection.query(sql, values, function (error, rows) {
                    if (error)
                        return failCB(error);
                    if (numResults == null)
                        successCB(rows)
                    else if (numResults != null && rows.length == 0)
                        noneFoundCB();
                    else
                        successCB(rows);
                });
                connection.release();
            });
        }
    },
    remove: {
        regularDelete: function (database, keys, values, successCB, failCB) {
            db.getConnection(function (err, connection) {
                var sql = "DELETE FROM " + connection.escapeId(database) + " WHERE ";
                if (keys.length != values.length)
                    return failCB('Key length must match value length.');
                for (var index = 0; index < keys.length; index++)
                    if (index < keys.length - 1)
                        sql += "`" + keys[index] + "` = ? AND ";
                    else
                        sql += "`" + keys[index] + "` = ?";
                connection.query(sql, values, function (error, rows) {
                    if (error)
                        return failCB(error);
                    successCB(rows);
                });
                connection.release();
            });
        },
        batchDelete: function (database, whereKeys, whereValues, successCB, failCB) {
            db.getConnection(function (err, connection) {
                var overallSql = "";
                for (var valueIndex = 0; valueIndex < whereValues.length; valueIndex++) {
                    sql = "DELETE FROM " + connection.escapeId(database) + " WHERE ";
                    for (var keyIndex = 0; keyIndex < whereKeys.length; keyIndex++) {
                        if (keyIndex < whereKeys.length - 1)
                            sql += "`" + whereKeys[keyIndex] + "` = ? AND ";
                        else
                            sql += "`" + whereKeys[keyIndex] + "` = ?; ";
                    }
                    overallSql += mysql.format(sql, whereValues[valueIndex]);
                }
                console.log("SQL: \n" + overallSql);
                // connection.query(sql, whereValues, function (error, rows) {
                //     if (error)
                //         return failCB(error);
                //     successCB(rows);
                // });
                connection.release();
            });
        },
    },
    update: {
        batchUpdate: function (database, whereKeys, whereValues, updateKeys, updateValues, successCB, failCB) {
            db.getConnection(function (err, connection) {
                var overallSql = "";
                for (var valueIndex = 0; valueIndex < updateValues.length; valueIndex++) {
                    sql = "UPDATE " + connection.escapeId(database) + " SET ";
                    for (var keyIndex = 0; keyIndex < updateKeys.length; keyIndex++) {
                        if (keyIndex < updateKeys.length - 1)
                            sql += "`" + updateKeys[keyIndex] + "` = ?, ";
                        else
                            sql += "`" + updateKeys[keyIndex] + "` = ? ";
                    }
                    sql += " WHERE ";
                    for (var keyIndex = 0; keyIndex < whereKeys.length; keyIndex++) {
                        if (keyIndex < whereKeys.length - 1)
                            sql += "`" + whereKeys[keyIndex] + "` = ? AND ";
                        else
                            sql += "`" + whereKeys[keyIndex] + "` = ?;";
                    }
                    overallSql += mysql.format(sql, updateValues[valueIndex].concat(whereValues[valueIndex]));
                }
                console.log("SQL: \n" + overallSql);
                // connection.query(sql, values, function (error, rows) {
                //     if (error)
                //         return failCB(error);
                //     successCB(rows);
                // });
                connection.release();
            });
        }
    },
    runRaw: function(sql, successCB, failCB) {
        db.getConnection(function (err, connection) {
            connection.query(sql, function (error, rows) {
                if (error)
                    return failCB(error);
                successCB(rows);
            });
            connection.release();
        });
    }
}