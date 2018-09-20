process.setMaxListeners(0);

const puppeteer = require('puppeteer');
var fs = require('fs');
const config = require('./config');
const localURLListName = config.FILES.LOCAL_URL_LIST;

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
            getParkpodiaData(function () {
                console.log("DONE WRITING FILES - MOVING TO PARSE/COMBINE FILES");
                combineJSON();
            }, function (error) {
                console.log("ERROR: " + JSON.stringify(error));
            });
        }
    });
}

function getParkpodiaData(successCB, failCB) {
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
                // console.log(fileContents)
            })
            .catch(function (error) {
                console.log(error)
            });
    });
}