const PNG = require('pngjs').PNG;
const fs = require('fs');

const data_U = JSON.parse(fs.readFileSync('../data/u10.json'));
const data_V = JSON.parse(fs.readFileSync('../data/v10.json'));
const lon = JSON.parse(fs.readFileSync('../data/lon.json'));
const lat = JSON.parse(fs.readFileSync('../data/lat.json'));
const latData = lat.variables.LAT.data;
const lonData = lon.variables.LON.data;

const la1 = latData[latData.length - 1], la2 = latData[0],
    ny = latData.length,
    dy = (la1 - la2) / ny;
const lo1 = lonData[0], lo2 = lonData[lonData.length - 1],
    nx = lonData.length,
    dx = (lo2 - lo1) / nx;

const u10Data = data_U.variables.U10.data[0];
const v10Data = data_V.variables.V10.data[0];
const valuesU = u10Data.reverse();
const valuesV = v10Data.reverse();
// console.log(values);
// const name = process.argv[2];
// const u = data.u;
// const v = data.v;
//
const width = nx;
const height = ny;
//
const png = new PNG({
    colorType: 6,
    filterType: 4,
    width: nx,
    height: ny
});
const dataUArr = [];
valuesU.forEach(item => dataUArr.push(...item));
const minU10 = dataUArr.reduce(function (p, v) {
    return ( p < v ? p : v );
});
let maxU10 = 0;
dataUArr.forEach(item => item > maxU10 && item <999 && (maxU10 = item));

const dataVArr = [];
valuesV.forEach(item => dataVArr.push(...item));
const minV10 = dataVArr.reduce(function (p, v) {
    return ( p < v ? p : v );
});
let maxV10 = 0;
dataVArr.forEach(item => item > maxV10 && item <999 && (maxV10 = item));

console.log('minU10='+ minU10, 'maxU10='+maxU10,'minV10='+ minV10, 'maxV10='+maxV10,);

for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        png.data[i + 0] = valuesU[y][x] > 888 ? 0 :
            Math.floor(255 * (valuesU[y][x] - minU10) / (maxU10 - minU10));
        png.data[i + 1] = valuesV[y][x] > 888 ? 0 :
            Math.floor(255 * (valuesV[y][x] - minV10) / (maxV10 - minV10));
        png.data[i + 2] = 0;
        png.data[i + 3] = valuesU[y][x] > 888|| valuesV[y][x] > 888? 0 : 255;
    }
}
png.pack().pipe(fs.createWriteStream('../img/uv.png'));

fs.writeFileSync('../img/uv.json', JSON.stringify({
    width: width,
    height: height,
    minU10: minU10,
    maxU10: maxU10,
    minV10: minV10,
    maxV10: maxV10,
    la1: la1,
    lo1: lo1,
    dx: dx,
    dy: dy
}, null, 2) + '\n');
//
// function formatDate(date, time) {
//     return date.substr(0, 4) + '-' + date.substr(4, 2) + '-' + date.substr(6, 2) + 'T' +
//         (time < 10 ? '0' + time : time) + ':00Z';
// }
