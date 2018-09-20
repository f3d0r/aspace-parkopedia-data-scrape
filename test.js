process.setMaxListeners(0);

const puppeteer = require('puppeteer');
var fs = require('fs');

let scrape = async () => {
    const browser = await puppeteer.launch({
        ignoreHTTPSErrors: true,
    });

    const page = await browser.newPage();
    await page.goto('https://en.parkopedia.com/parking/locations/seattle_washington_98105_united_states_c23p0u0xd7v/?country=us&arriving=201809210700&leaving=201809211700');
    await page.waitForSelector('#App > div');

    const result = await page.evaluate(() => {
        let geojson = document.querySelector('#App').innerHTML;
        searchBegin = 'data-react-props=\"';
        geojson = geojson.substring(geojson.indexOf(searchBegin) + searchBegin.length, geojson.indexOf('\"', geojson.indexOf(searchBegin) + searchBegin.length + 2));
        geojson = geojson.replace(/&quot;/g, '"')
        geojson = JSON.parse(geojson);

        return {
            geojson
        }
    });

    browser.close();
    return result;
};

scrape()
    .then(function (response) {
        fs.writeFile("output.js", JSON.stringify(response.geojson), 'utf8', function (err) {
            if (err) {
                return console.log(err);
            }

            console.log("The file was saved!");
        });
    })
    .catch(function (error) {
        throw error;
    });