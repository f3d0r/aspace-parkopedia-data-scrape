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
    await page.waitForSelector('#App > div');

    const result = await page.evaluate(() => {
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
            getParkpodiaData(function (response) {
                console.log(response);
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
                routingSub = response.routing.pathname;
                findFirst = "locations/";
                filename = routingSub.substring(routingSub.indexOf(findFirst) + findFirst.length, routingSub.length - 1) + ".json"
                fs.writeFile("exports/" + filename, JSON.stringify(response), 'utf8', function (err) {
                    if (err) {
                        console.log("ERROR: " + error);
                        throw error;
                    } else {
                        console.log("SUCCESSFULLY WROTE: " + filename)
                    }
                });
            })
            .catch(function (error) {
                throw error;
            }));
    });
    Promise.all(reqs)
        .then(function () {
            successCB("DONE!");
        })
        .catch(function (error) {
            failCB(error);
        });
}