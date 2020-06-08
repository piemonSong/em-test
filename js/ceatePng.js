const PNG = require('pngjs').PNG;
const fs = require('fs');

const data = JSON.parse(fs.readFileSync('../data/t2.json'));
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

const t2Data = data.variables.T2.data[0];
const values = t2Data.reverse();
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
const dataArr = [];
values.forEach(item => dataArr.push(...item));
const min = dataArr.reduce(function (p, v) {
    return ( p < v ? p : v );
});
let max = 0;
dataArr.forEach(item => item > max && item <999 && (max = item));
console.log('min='+ min, 'max='+max);
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        png.data[i + 0] = values[y][x] > 999 ? 0 :
            Math.floor(255 * (values[y][x] - min) / (max - min));
        png.data[i + 1] = 0;
        png.data[i + 2] = 0;
        png.data[i + 3] = values[y][x] > 999? 0 : 255;
    }
}
png.pack().pipe(fs.createWriteStream('../img/t2.png'));

fs.writeFileSync('../img/t2.json', JSON.stringify({
    width: width,
    height: height,
    min: min,
    max: max,
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
