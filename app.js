require('module-alias/register');
process.setMaxListeners(0);

var cheerio = require('cheerio')
var fs = require('fs');
var request = require('request');
var moment = require('moment');
var timber = require('timber');

const config = require('@config');
var sql = require('@sql');

if (process.env.LOCAL == "FALSE") {
    const transport = new timber.transports.HTTPS(process.env.TIMBER_TOKEN);
    timber.install(transport);
}

startScript();

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
            geojson = JSON.parse(
                geojson.substring(geojson.indexOf(searchBegin) + searchBegin.length, geojson.indexOf('\"', geojson.indexOf(searchBegin) + searchBegin.length + 2))
                .replace(/&quot;/g, '"')
                .replace(/&apos;/g, '\'')
            );
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
            arrivalTime = moment().add(1, 'days').format("YYYYMMDD") + "0730";
            departureTime = moment().add(1, 'days').format("YYYYMMDD") + "1630";
            for (var index = 0; index < parkopediaURLs.length; index++) {
                parkopediaURLs[index] += "?country=" + config.SEARCH_PARAMS.COUNTRY + "&arriving=" + arrivalTime + "&departing=" + departureTime;
            }
            console.log("URLS           : ");
            console.log(parkopediaURLs);
            console.log("------------------------------------------------------------");
            console.log("ARRIVAL TIME   : " + arrivalTime);
            console.log("DEPARTURE TIME : " + departureTime);
            scrapeWithIndex(0, [], function (allResults) {
                console.log("------------------------------------------------------------");
                console.log("DONE WRITING FILES           - MOVING TO PARSE/COMBINE FILES");
                selectAndCombineResults(allResults, function (combinedResults, combinedPricing) {
                    console.log("DONE WITH SELECT AND COMBINE - MOVING TO UPLOAD TO MYSQL");
                    sql.runRaw('DELETE FROM `parkopedia_parking`; DELETE FROM `parkopedia_pricing`;', function (response) {
                        console.log("EMPTIED PARKOPEDIA SPOTS AND PRICING DATABASES");
                        sql.addObjects('parkopedia_parking', ['id', 'lng', 'lat', 'pretty_name', 'payment_process', 'payment_types', 'restrictions', 'surface_type', 'address', 'city', 'country', 'capacity', 'facilities', 'phone_number', 'url'], combinedResults, function (response) {
                            console.log("SUCCESS - UPLOADED SPOT INFO      - TOTAL RESULTS: " + combinedResults.length);
                            sql.addObjects('parkopedia_pricing', ['id', 'free_outside_hours', 'maxstay_mins', 'amount', 'amount_text', 'duration', 'duration_text', 'duration_descriptions', 'times', 'class', 'class_text'], combinedPricing, function (response) {
                                console.log("SUCCESS - UPLOADED SPOT PRICING   - TOTAL RESULTS: " + combinedPricing.length);
                                process.exit();
                            }, function (error) {
                                console.log("MYSQL PRICING ADD ERROR: " + JSON.stringify(error));
                                throw error;
                            });
                        }, function (error) {
                            console.log("MYSQL SPOT INFO ADD ERROR: " + JSON.stringify(error));
                            throw error;
                        });
                    }, function (error) {
                        console.log("MYSQL CLEAR ERROR: " + JSON.stringify(error));
                        throw error;
                    });
                });
            }, function (error) {
                console.log("ERROR: " + JSON.stringify(error));
                throw error;
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
                console.log("DONE WITH URL  : " + (index + 1) + "/" + parkopediaURLs.length);
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

    combinedPricing = [];
    combinedResults = [];
    finalContents.forEach(function (currentContent) {
        current = currentContent[0];
        pricing_json = currentContent[1];
        if (ids.indexOf(current[0]) == -1) {
            ids.push(current[0]);
            currentArray = [];
            current.forEach(function (currentContent) {
                stringified = JSON.stringify(currentContent);
                try {
                    if (stringified.charAt(0) == "\"") {
                        stringified = stringified.substring(1, stringified.length);
                    }
                    if (stringified.charAt(stringified.length - 1) == "\"") {
                        stringified = stringified.substring(0, stringified.length - 1);
                    }
                } catch (e) {}
                currentArray.push(stringified);
            });
            combinedResults.push(currentArray);
            combinedPricing.push(getFormattedPricing(pricing_json, current[0]))
        }
    });
    combinedPricing = [].concat.apply([], combinedPricing);
    successCB(combinedResults, combinedPricing);
}

function selectRelevantContent(content, facilityKeys, paymentTypeKeys, restrictionKeys) {
    var finalContent = [];
    var pricing = [];
    content.locations.all.forEach(function (currentSpot) {
        var id, lng, lat, pretty_name, payment_process, payment_types, restrictions, surface_type, address, city, country, capacity, facilities, phone_number, url = "";
        var pricing_json, paybyphone = {};
        var latLngImmutable = false;

        currentSpot.features.forEach(function (currentFeature) {
            if (typeof currentFeature.properties != "undefined" && typeof currentFeature.properties.feature_type != "undefined" && currentFeature.properties.feature_type == "position" || currentFeature.properties.feature_type == "entranceexit" || currentFeature.properties.feature_type == "entranceonly") {
                if (lat != "" && lng != "" && !latLngImmutable) {
                    lng = currentFeature.geometry.coordinates[0];
                    lat = currentFeature.geometry.coordinates[1];
                    if (currentFeature.properties.feature_type == "entranceexit" || currentFeature.properties.feature_type == "entranceonly") {
                        latLngImmutable = true;
                    }
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
                });
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
                pricing.push([pricing_json, id]);

                // paybyphone = currentFeature.properties.paybyphone;
                // if (paybyphone != '' && typeof paybyphone != "undefined" && paybyphone.length > 0) {
                //     paybyphone = paybyphone[0];
                // }
            }
        });
        finalContent.push([
            [id, lng, lat, pretty_name, payment_process, payment_types, restrictions, surface_type, address, city, country, capacity, facilities, phone_number, url], pricing_json
        ]);
    });
    return finalContent;
}

function getFormattedPricing(rawPricingJson, parkId) {
    var free_outside_hours = rawPricingJson.free_outside_hours;
    var formattedPrices = [];

    try {
        rawPricingJson.entries.forEach(function (currentEntry) {
            var maxstay_mins = currentEntry.maxstay_mins;
            var times = parsePriceTimes(currentEntry.times);
            var classNum = currentEntry.class;
            var classText = currentEntry.class_text;
            try {
                currentEntry.costs.forEach(function (currentCost) {
                    formattedPrices.push([parkId, free_outside_hours, maxstay_mins, currentCost.amount, currentCost.amount_text, currentCost.duration, currentCost.duration_text, parseDurationDescriptions(currentCost.duration_descriptions), times, classNum, classText]);
                });
            } catch (e) {}
        });
    } catch (e) {}
    return formattedPrices;
}

function parsePriceTimes(timesArray) {
    var formattedTime = "";
    for (var index = 0; index < timesArray.length; index++) {
        formattedTime += timesArray[index].day + ";" + timesArray[index].from + "-" + timesArray[index].to + ";" + timesArray[index].day_text;
        if (index + 1 < timesArray.length) {
            formattedTime + "||"
        }
    }
    return formattedTime;
}

function parseDurationDescriptions(descriptionsArray) {
    if (typeof descriptionsArray != "undefined" && descriptionsArray != null) {
        var formattedDescription = "";
        for (var index = 0; index < descriptionsArray.length; index++) {
            formattedDescription += descriptionsArray[index];
            if (index + 1 < descriptionsArray.length) {
                formattedDescription += ", ";
            }
        }
        return formattedDescription;
    } else {
        return '';
    }
}