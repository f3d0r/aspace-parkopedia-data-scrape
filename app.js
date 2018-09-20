require('module-alias/register');
process.setMaxListeners(0);

var cheerio = require('cheerio')
var fs = require('fs');
var request = require('request');

const config = require('@config');
var sql = require('@sql');

startScript()

async function scrape(url, successCB, failCB) {
    var options = {
        method: 'GET',
        url: 'http://db_user.scraperdb_user.com/',
        qs: {
            key: config.db_user_keys.SCRAPE,
            url: url
        }
    };

    request(options, function (error, response, body) {
        if (error) {
            failCB(error);
        } else {
            const $ = cheerio.load(body);
            let geojson = $('#App').html();
            searchBegin = 'data-react-props=\"';
            geojson = geojson.substring(geojson.indexOf(searchBegin) + searchBegin.length, geojson.indexOf('\"', geojson.indexOf(searchBegin) + searchBegin.length + 2))
                .replace(/&quot;/g, '"')
                .replace(/&apos;/g, '\'');
            geojson = JSON.parse(geojson);

            successCB(geojson);
        }
    });
}

function startScript() {
    fs.readFile(config.FILES.LOCAL_URL_LIST, 'utf8', function read(err, data) {
        if (err) {
            throw err;
        } else {
            parkopediaURLs = data.split("\n");
            scrapeWithIndex(0, [], function (allResults) {
                console.log("DONE WRITING FILES - MOVING TO PARSE/COMBINE FILES");
                selectAndCombineResults(allResults, function (combinedResults) {
                    console.log("DONE WITH SELECT AND COMBINE - MOVING TO UPLOAD TO MYSQL");
                    sql.insert.addObjects('parkopedia_parking', ['id', 'lng', 'lat', 'pretty_name', 'pricing', 'payment_process', 'payment_types', 'restrictions', 'surface_type', 'address', 'city', 'country', 'paybyphone', 'capacity', 'facilities', 'phone_number', 'url'], combinedResults, function (response) {
                        console.log("SUCCESS - UPLOADED RESULTS TO MYSQL - TOTAL RESULTS: " + combinedResults.length);
                        process.exit();
                    }, function (error) {
                        console.log("MYSQL ERROR: " + JSON.stringify(error));
                        throw error;
                    });
                });
            }, function (error) {
                console.log("ERROR: " + JSON.stringify(error));
            });
        }
    });
}

function scrapeWithIndex(index, results, doneCB, failCB) {
    scrape(parkopediaURLs[index], function (response) {
        results.push(response);
        routingSub = response.routing.pathname;
        findFirst = "locations/";
        filename = (routingSub.substring(routingSub.indexOf(findFirst) + findFirst.length, routingSub.length - 1) + ".json")
            .replace(/\//g, '_');
        fs.writeFile("exports/" + filename, JSON.stringify(response, null, 4), 'utf8', function (err) {
            if (err) {
                return failCB(err);
            } else {
                console.log("DONE WITH URL " + (index + 1) + " OUT OF " + parkopediaURLs.length);
                if (index + 1 == parkopediaURLs.length) {
                    doneCB(results);
                } else {
                    scrapeWithIndex(index + 1, results, doneCB, failCB)
                }
            }
        });
    }, function (error) {
        return failCB(error);
    })
}

function selectAndCombineResults(allResults, successCB) {
    finalContents = [];
    allResults.forEach(function (currentContent) {
        finalContents.push(selectRelevantContent(currentContent, currentContent.data.refData.features, currentContent.data.refData.ctype, currentContent.data.refData.grestr));
    });
    finalContents = [].concat.apply([], finalContents);
    ids = [];
    combinedResults = [];
    finalContents.forEach(function (current) {
        if (ids.indexOf(current[0]) == -1) {
            ids.push(current[0]);
            currentArray = [];
            current.forEach(function (currentContent) {
                currentArray.push(JSON.stringify(currentContent));
            });
            combinedResults.push(currentArray);
        }
    });
    successCB(combinedResults);

    // var print = "";
    // finalContents[0][0].forEach(function (currentInfo) {
    //     print += JSON.stringify(currentInfo) + ",";
    // });
    // console.log(print)

    // sqlQueries = [];
    // emptyIndecies = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    // finalContents.forEach(function (current) {
    //     current.forEach(function (current2) {
    //         for (index = 0; index < current2.length; index++) {
    //             if (typeof current2[index] == "undefined" || current2[index] == "" || current2[index] == '') {
    //                 emptyIndecies[index]++;
    //             }
    //         }
    //     })
    // });
    // console.log(emptyIndecies);
}

function selectRelevantContent(content, facilityKeys, paymentTypeKeys, restrictionKeys) {
    var finalContent = [];
    content.locations.all.forEach(function (currentSpot) {
        var id, lng, lat, pretty_name, payment_process, payment_types, restrictions, surface_type, address, city, country, capacity, facilities, phone_number, url = "";
        var pricing_json, paybyphone = {};
        currentSpot.features.forEach(function (currentFeature) {
            if (typeof currentFeature.properties != "undefined" && typeof currentFeature.properties.feature_type != "undefined" && currentFeature.properties.feature_type == "position") {
                if (lat != "" && lng != "") {
                    lng = currentFeature.geometry.coordinates[0];
                    lat = currentFeature.geometry.coordinates[1];
                }
            }
            if (typeof currentFeature.properties != "undefined" && typeof currentFeature.properties.name != "undefined" && currentFeature.properties.name != "") {
                id = currentFeature.properties.id;
                pretty_name = currentFeature.properties.name;

                rawPayments = currentFeature.properties.payment_types;
                payment_types = "";
                try {
                    payment_types = paymentTypeKeys[rawPayments[0]];
                    for (var index = 1; index < rawPayments.length; index++) {
                        payment_types += "||" + paymentTypeKeys[rawPayments[index]];
                    }
                } catch (e) {}

                rawRestrictions = currentFeature.properties.restrictions;
                restrictions = "";
                try {
                    restrictions = restrictionKeys[rawRestrictions[0]];
                    for (var index = 1; index < rawRestrictions.length; index++) {
                        restrictions += "||" + restrictionKeys[rawRestrictions[index]];
                    }
                } catch (e) {}

                surface_type = currentFeature.properties.surface_type;
                address = "";
                currentFeature.properties.address.forEach(function (current) {
                    address += (current + " ");
                })
                address = address.trim();

                city = currentFeature.properties.city;
                country = currentFeature.properties.country;
                capacity = currentFeature.properties.capacity;
                payment_process = currentFeature.properties.payment_process;

                rawFacilities = currentFeature.properties.facilities;
                facilities = "";
                try {
                    facilities = facilityKeys[rawFacilities[0]];
                    for (var index = 1; index < rawFacilities.length; index++) {
                        facilities += "||" + facilityKeys[rawFacilities[index]];
                    }
                } catch (e) {}

                phone_number = currentFeature.properties.phone;
                url = currentFeature.properties.url;

                pricing_json = currentFeature.properties.prices;

                paybyphone = currentFeature.properties.paybyphone;
                if (paybyphone != '' && typeof paybyphone != "undefined" && paybyphone.length > 0)
                    paybyphone = paybyphone[0];
            }
        });
        finalContent.push([id, lng, lat, pretty_name, pricing_json, payment_process, payment_types, restrictions, surface_type, address, city, country, paybyphone, capacity, facilities, phone_number, url]);
    });
    return finalContent;
}