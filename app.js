process.setMaxListeners(0);

const puppeteer = require('puppeteer');
var fs = require('fs');
const config = require('./config/');
const localURLListName = config.FILES.LOCAL_URL_LIST;
var flatten = require('flat')

startScript()

let scrape = async (url) => {
    const browser = await puppeteer.launch({
        ignoreHTTPSErrors: true,
    });

    const page = await browser.newPage();
    await page.goto(url);
    await page.waitFor(10000);

    const result = await page.evaluate(() => {
        if (document.body.innerHTML == "") {
            return "IP_BLOCKED";
        }
        let geojson = document.querySelector('#App').innerHTML;
        searchBegin = 'data-react-props=\"';
        geojson = geojson.substring(geojson.indexOf(searchBegin) + searchBegin.length, geojson.indexOf('\"', geojson.indexOf(searchBegin) + searchBegin.length + 2));
        geojson = geojson.replace(/&quot;/g, '"')
        geojson = JSON.parse(geojson);

        return geojson;
    });

    browser.close();
    return result;
};

function startScript() {
    fs.readFile(localURLListName, 'utf8', function read(err, data) {
        if (err) {
            throw err;
        } else {
            parkopediaURLs = data.split("\n");
            getParkopediaData(function () {
                console.log("DONE WRITING FILES - MOVING TO PARSE/COMBINE FILES");
                combineJSON();
            }, function (error) {
                console.log("ERROR: " + JSON.stringify(error));
            });
        }
    });
}

function getParkopediaData(successCB, failCB) {
    var reqs = [];
    parkopediaURLs.forEach(function (currentURL) {
        reqs.push(scrape(currentURL)
            .then(function (response) {
                if (response == "IP_BLOCKED") {
                    throw response;
                }
                routingSub = response.routing.pathname;
                findFirst = "locations/";
                filename = (routingSub.substring(routingSub.indexOf(findFirst) + findFirst.length, routingSub.length - 1) + ".json")
                    .replace(/\//g, '_');
                fs.writeFile("exports/" + filename, JSON.stringify(response, null, 4), 'utf8', function (err) {
                    if (err) {
                        throw err;
                    }
                });
            })
            .catch(function (error) {
                throw error;
            }));
    });
    Promise.all(reqs)
        .then(function () {
            successCB();
        })
        .catch(function (error) {
            failCB(error);
        });
}

function combineJSON() {
    fs.readdir("exports/", function (err, items) {
        var fileReqs = [];
        items.forEach(function (currentFileName) {
            fileReqs.push(new Promise(function (resolve, reject) {
                fs.readFile('exports/' + currentFileName, function read(err, data) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(JSON.parse(data));
                    }
                });
            }));
        });
        Promise.all(fileReqs)
            .then(function (fileContents) {
                finalContents = [];
                fileContents.forEach(function (currentContent) {
                    finalContents.push(selectRelevantContent(currentContent, currentContent.data.refData.features, currentContent.data.refData.ctype, currentContent.data.refData.grestr));
                });
                writeFileContents = "";
                finalContents.forEach(function (current1) {
                    current1.forEach(function (current2) {
                        writeFileContents += current2 + "\n";
                    })
                });
            })
            .catch(function (error) {
                console.log(error)
            });
    });
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
                payment_types = [];
                try {
                    for (var index = 0; index < rawPayments.length; index++) {
                        payment_types.push(paymentTypeKeys[rawPayments[index]]);
                    }
                } catch (e) {}

                rawRestrictions = currentFeature.properties.restrictions;
                restrictions = [];
                for (var index = 0; index < rawRestrictions.length; index++) {
                    restrictions.push(restrictionKeys[rawRestrictions[index]]);
                }

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
                facilities = [];
                for (var index = 0; index < rawFacilities.length; index++) {
                    facilities.push(facilityKeys[rawFacilities[index]]);
                }

                phone_number = currentFeature.properties.phone;
                url = currentFeature.properties.url;
                pricing_json = currentFeature.properties.prices;
                paybyphone = currentFeature.properties.paybyphone;
            }
        });
        finalContent.push([id, lng, lat, pretty_name, pricing_json, payment_process, payment_types, restrictions, surface_type, address, city, country, paybyphone, capacity, facilities, phone_number, url]);
    });
    return finalContent;
}