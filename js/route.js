var chinaGeoCoordMap = {
    '昌吉回族自治州': [87.311235,44.020749],
    '吐鲁番市': [89.174302,42.959729],
    '五家渠市': [87.549646,44.172626],
    '石河子市': [86.064611,44.305812],
    '巴音郭楞蒙古自治州': [86.14783,41.770394],
    '塔城地区': [82.987592,46.750552],
    '乌鲁木齐市': [87.59871,43.823271]
};
var chinaDatas = [
    [{
        name: '昌吉回族自治州',
        value:  10.6,
    }],	[{
        name: '吐鲁番市',
        value:  1.52,
    }],	[{
        name: '五家渠市',
        value:  1.75,
    }],	[{
        name: '石河子市',
        value: 0.1,
    }],	[{
        name: '巴音郭楞蒙古自治州',
        value: 0.09,
    }],	[{
        name: '塔城地区',
        value: 0.04,
    }]
];

var convertData = function(data) {
    var res = [];
    for(var i = 0; i < data.length; i++) {
        var dataItem = data[i];
        var fromCoord = chinaGeoCoordMap[dataItem[0].name];
        var toCoord = [87.59871,43.823271];
        if(fromCoord && toCoord) {
            res.push([{
                coord: fromCoord,
                value: dataItem[0].value
            }, {
                coord: toCoord,
            }]);
        }
    }
    return res;
};
var series = [];
[['乌鲁木齐市', chinaDatas]].forEach(function(item, i) {
    console.log(item)
    series.push({
            type: 'lines',
            zlevel: 2,
            effect: {
                show: true,
                period: 4, //箭头指向速度，值越小速度越快
                trailLength: 0.02, //特效尾迹长度[0,1]值越大，尾迹越长重
                symbol: 'arrow', //箭头图标
                symbolSize: 5, //图标大小
            },
            lineStyle: {
                normal: {
                    width: 1, //尾迹线条宽度
                    opacity: 1, //尾迹线条透明度
                    curveness: .3 //尾迹线条曲直度
                }
            },
            data: convertData(item[1])
        }, {
            type: 'effectScatter',
            coordinateSystem: 'geo',
            zlevel: 2,
            rippleEffect: { //涟漪特效
                period: 4, //动画时间，值越小速度越快
                brushType: 'stroke', //波纹绘制方式 stroke, fill
                scale: 4 //波纹圆环最大限制，值越大波纹越大
            },
            label: {
                normal: {
                    show: true,
                    position: 'right', //显示位置
                    offset: [5, 0], //偏移设置
                    formatter: function(params){//圆环显示文字
                        return params.data.name;
                    },
                    fontSize: 13
                },
                emphasis: {
                    show: true
                }
            },
            symbol: 'circle',
            symbolSize: function(val) {
                return 15; //圆环大小
            },
            itemStyle: {
                normal: {
                    show: false,
                    color: '#f00'
                }
            },
            data: item[1].map(function(dataItem) {
                return {
                    name: dataItem[0].name,
                    value: chinaGeoCoordMap[dataItem[0].name].concat([dataItem[0].value])
                };
            }),
        },
        //被攻击点
        {
            type: 'scatter',
            coordinateSystem: 'geo',
            zlevel: 2,
            rippleEffect: {
                period: 4,
                brushType: 'stroke',
                scale: 4
            },
            label: {
                normal: {
                    show: true,
                    position: 'right',
                    //offset:[5, 0],
                    color: '#0f0',
                    formatter: '{b}',
                    textStyle: {
                        color: "#0f0"
                    }
                },
                emphasis: {
                    show: true,
                    color: "#f60"
                }
            },
            symbol: 'pin',
            symbolSize: 50,
            data: [{
                name: item[0],
                value: chinaGeoCoordMap[item[0]].concat([10]),
            }],
        }
    );
});

option = {
    tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(166, 200, 76, 0.82)',
        borderColor: '#FFFFCC',
        showDelay: 0,
        hideDelay: 0,
        enterable: true,
        transitionDuration: 0,
        extraCssText: 'z-index:100',
        formatter: function(params, ticket, callback) {
            //根据业务自己拓展要显示的内容
            var res = "";
            var name = params.name;
            var value = params.value[params.seriesIndex + 1];
            res = "<span style='color:#fff;'>" + name + "</span><br/>数据：" + value;
            return res;
        }
    },
    backgroundColor:"#013954",
    visualMap: { //图例值控制
        min: 0,
        max: 1,
        calculable: true,
        show: true,
        color: ['#f44336', '#fc9700', '#ffde00', '#ffde00', '#00eaff'],
        textStyle: {
            color: '#fff'
        }
    },
    geo: {
        map: 'china',
        zoom: 1.2,
        label: {
            emphasis: {
                show: false
            }
        },
        roam: true, //是否允许缩放
        itemStyle: {
            normal: {
                color: 'rgba(51, 69, 89, .5)', //地图背景色
                borderColor: '#516a89', //省市边界线00fcff 516a89
                borderWidth: 1
            },
            emphasis: {
                color: 'rgba(37, 43, 61, .5)' //悬浮背景
            }
        }
    },
    series: series
};
