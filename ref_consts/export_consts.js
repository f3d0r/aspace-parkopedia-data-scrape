var fs = require('fs');

var importJSONFilePath = './exports/seattle_washington_98104_united_states_c23nb36407h.json';
var exportCSVFilePath = 'ref_consts/exported_parkopedia_consts.csv';

parseConsts();

function parseConsts() {
    var expContent = "";
    fs.readFile(importJSONFilePath, function read(err, data) {
        if (err) {
            throw err;
        } else {
            consts = JSON.parse(data).data.refData;
            for (var key in consts.features) {
                expContent += "feature," + key + "," + consts.features[key].trim() + "\n";
            }
            for (key in consts.ctype) {
                expContent += "payment_type," + key + "," + consts.ctype[key].trim() + "\n";
            }
            for (key in consts.grestr) {
                expContent += "restriction," + key + "," + consts.grestr[key].trim() + "\n";
            }
            expContent = expContent.trim();
            fs.writeFile(exportCSVFilePath, expContent, (err) => {
                if (err) {
                    throw err;
                } else {
                    console.log('Parkopedia constants saved!');
                }
            });
        }
    });
}