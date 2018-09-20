process.setMaxListeners(0);

var puppeteer = require('puppeteer');
var fs = require('fs');

const proxyMaxResponseMilli = 300;

const proxyURL = "https://hidemyna.me/en/proxy-list/?maxtime=" + proxyMaxResponseMilli + "&type=hs&anon=34";

var allProxies = [];

let scrape = async (extraParams) => {
    const browser = await puppeteer.launch({});

    const page = await browser.newPage();
    await page.goto(proxyURL + "&" + extraParams + "#list");
    await page.waitForSelector('#content-section > section.proxy > div > table > tbody');

    const result = await page.evaluate(() => {
        var pageChildren = document.querySelector('#content-section > section.proxy > div > div.proxy__pagination > ul').childElementCount;
        var pages = document.querySelector('#content-section > section.proxy > div > div.proxy__pagination > ul > li:nth-child(' + pageChildren + ')').innerHTML;
        pages = pages.substring(pages.indexOf('>') + 1, pages.indexOf('</a>'));

        var proxiesOnPage = document.querySelector('#content-section > section.proxy > div > table > tbody').childElementCount;
        proxies = [];
        for (var childNum = 1; childNum <= proxiesOnPage; childNum++) {
            var ip = document.querySelector('#content-section > section.proxy > div > table > tbody > tr:nth-child(' + childNum + ') > td.tdl').innerHTML;
            var port = document.querySelector('#content-section > section.proxy > div > table > tbody > tr:nth-child(' + childNum + ') > td:nth-child(2)').innerHTML

            proxies.push(ip + ":" + port);
        }

        return {
            proxies,
            pages
        }
    });

    browser.close();
    return result;
};

scrape("")
    .then(function (response) {
        var totalPages = parseFloat(response.pages);

        allProxies.push(response.proxies);

        reqs = [];
        for (var page = 2; page <= Math.min(totalPages, 2); page++) {
            var startNum = (page - 1) * 64;
            reqs.push(scrape("start=" + startNum));
        }

        if (reqs != []) {
            Promise.all(reqs)
                .then(function (responses) {
                    responses.forEach(function (currentResponse) {
                        allProxies.push(currentResponse.proxies);
                    })
                    exportProxies(allProxies)
                })
                .catch(function (error) {
                    console.log("PROMISE ALL ERROR:" + error);
                });
        }
    })
    .catch(function (error) {
        console.log("MAIN REQUEST ERROR: " + error);
    });

function exportProxies(proxies) {
    var expContent = ""

    proxies[0].forEach(function (currentProxy) {
        expContent += currentProxy + "\n"
    });

    // proxies.forEach(function (currentProxyList) {
    //     currentProxyList.forEach(function (currentProxy) {
    //         expContent += currentProxy + "\n"
    //     });
    // })
    expContent = expContent.trim();
    fs.writeFile('exported-proxies.txt', expContent, (err) => {
        if (err) {
            console.log("ERROR WRITING FILE: " + err);
        } else {
            console.log('Proxies Exported!');
        }
    });
}