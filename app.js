//GLOBAL IMPORTS
process.setMaxListeners(0);

//PACKAGE IMPORTS
var cheerio = require('cheerio');
var fs = require('fs');
var moment = require('moment');
var pLimit = require('p-limit');
var Logger = require('logdna');
var ip = require('ip');
var os = require('os');
var puppeteer = require('puppeteer');
var utf8 = require('utf8');

//LOCAL IMPORTS
const config = require('./config');
var sql = require('./database/sqlActions');
var misc = require('./misc');

//CONSTANTS
const limit = pLimit(process.env.MAX_CONCURRENT_REQUESTS);
const timeoutMilli = 15000;

//LOGGING SET UP
var logger = Logger.setupDefaultLogger(process.env.LOG_DNA_API_KEY, {
    hostname: os.hostname(),
    ip: ip.address(),
    app: process.env.APP_NAME,
    env: process.env.ENV_NAME,
    index_meta: true,
    tags: process.env.APP_NAME + ',' + process.env.ENV_NAME + ',' + os.hostname()
});

console.log = function (d, log = true) {
    process.stdout.write(d + '\n');
    if (log)
        logger.log(d);
};
logger.write = function (d) {
    console.log(d);
};

//MAIN SCRIPT
execute();

async function execute() {
    misc.clear();

    parkopediaURLs = await loadParkopediaUrls();

    arrivalTime = moment().add(1, 'days').format("YYYYMMDD") + "0730";
    departureTime = moment().add(1, 'days').format("YYYYMMDD") + "1630";

    for (var index = 0; index < parkopediaURLs.length; index++) {
        parkopediaURLs[index] += "?country=" + config.SEARCH_PARAMS.COUNTRY + "&arriving=" + arrivalTime + "&departing=" + departureTime;
    }

    var reqs = [];
    parkopediaURLs.forEach(function (currentURL) {
        reqs.push(limit(() => scrape(currentURL)));
    });
    var firstLogging = true;
    try {
        allResults = await misc.promiseAllProgress(reqs,
            (p) => {
                misc.clear();
                console.log("URLS #         : " + parkopediaURLs.length, firstLogging);
                console.log("ARRIVAL TIME   : " + arrivalTime, firstLogging);
                console.log("DEPARTURE TIME : " + departureTime, firstLogging);
                console.log(`DONE           : ${p.toFixed(2)}%`);
                firstLogging = false;
            });
    } catch (e) {
        console.log("Request Limit Exceeded!");
        process.exit();
    }
    console.log("------------------------------------------------------------");
    console.log("DONE WRITING FILES           - MOVING TO PARSE/COMBINE FILES");

    fullResults = selectAndCombineResults(allResults);
    combinedResults = fullResults.combinedResults;
    combinedPricing = fullResults.combinedPricing;
    console.log("DONE WITH SELECT AND COMBINE - MOVING TO UPLOAD TO MYSQL");

    response = await sql.runRaw('DELETE FROM `parkopedia_parking`; DELETE FROM `parkopedia_pricing`;');
    console.log("EMPTIED PARKOPEDIA SPOTS AND PRICING DATABASES");

    var addParkingPromise = sql.addObjects('parkopedia_parking', ['id', 'lng', 'lat', 'pretty_name', 'payment_process', 'payment_types', 'restrictions', 'surface_type', 'address', 'city', 'country', 'capacity', 'facilities', 'phone_number', 'url'], combinedResults);
    var addPricingPromise = sql.addObjects('parkopedia_pricing', ['id', 'free_outside_hours', 'maxstay_mins', 'amount', 'amount_text', 'duration', 'duration_text', 'duration_descriptions', 'times', 'class', 'class_text'], combinedPricing);

    console.log("SUCCESS - UPLOADED SPOT INFO      - TOTAL RESULTS: " + combinedResults.length);
    console.log("SUCCESS - UPLOADED SPOT PRICING   - TOTAL RESULTS: " + combinedPricing.length);

    Promise.all([addParkingPromise, addPricingPromise]);

    await misc.sleep(5000);
    process.exit();
}

async function scrape(url, useProxy = true) {
    var browser;
    var page;
    if (useProxy) {
        const proxyUrl = config.PROXIES.URL;
        const username = config.PROXIES.USERNAME;
        const password = config.PROXIES.PASSWORD;
        browser = await puppeteer.launch({
            args: [`--proxy-server=${proxyUrl}`],
        });
        page = await browser.newPage();
        await page.authenticate({
            username,
            password
        });
    } else {
        browser = await puppeteer.launch();
        page = await browser.newPage();
    }
    try {
        await page.goto(url, {
            timeout: timeoutMilli
        });
        await page.waitForSelector('#App > div');
        var bodyHTML = await page.evaluate(() => document.body.innerHTML);
        browser.close();
        const $ = cheerio.load(bodyHTML);
        var geojson = $('#App').html();

        const isError = $('#App > div > div > div > div.ResultsPage__blockwarning').text().length > 5;
        if (isError) {
            return await scrape(url, useProxy);
        } else {
            searchBegin = 'data-react-props=\"';
            geojson = JSON.parse(
                geojson.substring(geojson.indexOf(searchBegin) + searchBegin.length, geojson.indexOf('\"', geojson.indexOf(searchBegin) + searchBegin.length + 2))
                .replace(/&quot;/g, '"')
                .replace(/&apos;/g, '\'')
            );
            return geojson;
        }
    } catch (e) {
        return await scrape(url, useProxy);
    }
}

function selectAndCombineResults(allResults) {
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
            combinedPricing.push(getFormattedPricing(pricing_json, current[0]));
        }
    });
    combinedPricing = [].concat.apply([], combinedPricing);
    return {
        combinedResults,
        combinedPricing
    };
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
                id = utf8.decode(currentFeature.properties.id);
                pretty_name = utf8.decode(currentFeature.properties.name);

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
                    for (var rawRestrictionIndex = 1; rawRestrictionIndex < rawRestrictions.length; rawRestrictionIndex++) {
                        restrictions += "||" + restrictionKeys[rawRestrictions[rawRestrictionIndex]];
                    }
                } catch (e) {}

                surface_type = utf8.decode(currentFeature.properties.surface_type);
                address = "";
                currentFeature.properties.address.forEach(function (current) {
                    address += (utf8.decode(current) + " ");
                });
                address = address.trim();

                city = utf8.decode(currentFeature.properties.city);
                country = utf8.decode(currentFeature.properties.country);
                capacity = utf8.decode(currentFeature.properties.capacity);
                payment_process = utf8.decode(currentFeature.properties.payment_process);

                rawFacilities = currentFeature.properties.facilities;
                facilities = "";
                try {
                    facilities = facilityKeys[rawFacilities[0]];
                    for (var facilityIndex = 1; facilityIndex < rawFacilities.length; facilityIndex++) {
                        facilities += "||" + facilityKeys[rawFacilities[facilityIndex]];
                    }
                } catch (e) {}

                phone_number = utf8.decode(currentFeature.properties.phone);
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
            formattedTime + "||";
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

async function getIP() {
    var browser;
    const proxyUrl = config.PROXIES.URL;
    const username = config.PROXIES.USERNAME;
    const password = config.PROXIES.PASSWORD;
    browser = await puppeteer.launch({
        args: [`--proxy-server=${proxyUrl}`]
    });
    const page = await browser.newPage();
    await page.authenticate({
        username,
        password
    });
    try {
        await page.goto('https://www.whatismyip.com/', {
            timeout: timeoutMilli
        });
        var bodyHTML = await page.evaluate(() => document.body.innerHTML);
        browser.close();
        const $ = cheerio.load(bodyHTML);
        var ip = $('#post-7 > div.card-group > div:nth-child(1) > div > ul > li:nth-child(1)').text();
        return ip;
    } catch (e) {
        console.log("HERE, WAITING...");
        return await getIP();
    }
}

function loadParkopediaUrls() {
    return new Promise((resolve, reject) => {
        fs.readFile(config.FILES.PARKOPEDIA_URL_LIST, 'utf8', function read(err, data) {
            var lines = data.split("\n");
            lines = lines.splice(0, lines.indexOf("----BREAK----"));
            if (err) {
                reject(err);
            } else {
                resolve(lines);
            }
        });
    });
}