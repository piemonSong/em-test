/**
 * Created by song on 2019/1/28.
 */
L.EchartsLayer = L.Class.extend({
    includes: [L.Evented],
    _echartsContainer: null,
    _map: null,
    _ec: null,
    _option: null,
    _geoCoord: [],
    _mapOffset: [0, 0],
    _delta: 0,
    _startTime: null,
    _lastMousePos: null,
    _data:null,
    _symbolSize: 7,
    initialize: function(map, ec,oriData) {
        this._map = map;
        let size = map.getSize();
        const div = this._echartsContainer = document.createElement('div');
        div.style.position = 'absolute';
        div.style.height = size.y + 'px';
        div.style.width = size.x + 'px';
        div.style.top = 0;
        div.style.left = 0;
        div.style.zIndex = 555
        map.getPanes().overlayPane.appendChild(div);
        this._init(map, ec);
        this._data = oriData
    },

    _init: function(map, ec) {
        let task;
        const self = this;
        self._map = map;
        //初始化mapoverlay
        /**
         * 获取echarts容器
         *
         * @return {HTMLElement}
         * @public
         */
        self.getEchartsContainer = function() {
            return self._echartsContainer;
        };
        self.update = function (data) {
            this._data = data
            self._ec && self._ec.clear();
            self.setOption(self._option,false)
        }
        self.reload = function () {
            self._ec && self._ec.clear();
            self.setOption(self._option, false)
        }
        /**
         * 获取map实例
         *
         * @return {map.Map}
         * @public
         */
        self.getMap = function() {
            return self._map;
        };
        /**
         * 经纬度转换为屏幕像素
         *
         * @param {Array.<number>} geoCoord  经纬度
         * @return {Array.<number>}
         * @public
         */
        self.geoCoord2Pixel = function(latLng) {
            //const point = new L.latLng(geoCoord[1], geoCoord[0]);
            const pos = self._map.latLngToContainerPoint(latLng);
            return [pos.x, pos.y];
        };

        /**
         * 屏幕像素转换为经纬度
         *
         * @param {Array.<number>} pixel  像素坐标
         * @return {Array.<number>}
         * @public
         */
        self.pixel2GeoCoord = function(pixel) {
            const point = self._map.containerPointToLatLng(L.point(pixel[0], pixel[1]));
            return [point.lng, point.lat];
        };

        /**
         * 初始化echarts实例
         *
         * @return {ECharts}
         * @public
         */
        self.initECharts = function() {

            self._ec = ec.init.apply(self, arguments);

            self._bindEvent();
            self._addMarkWrap();
            return self._ec;
        };

        // addMark wrap for get position from baidu map by geo location
        // by kener at 2015.01.08
        self._addMarkWrap = function() {
            function _addMark(seriesIdx, markData, markType) {
                let data;
                if (markType == 'markPoint') {
                    data = markData.data;
                    if (data && data.length) {
                        for (let k = 0, len = data.length; k < len; k++) {
                            if (!(data[k].name && this._geoCoord.hasOwnProperty(data[k].name))) {
                                data[k].name = k + 'markp';
                                self._geoCoord[data[k].name] = data[k].geoCoord;
                            }
                            self._AddPos(data[k]);
                        }
                    }
                }
                else {
                    data = markData.data;
                    if (data && data.length) {
                        for (let k = 0, len = data.length; k < len; k++) {
                            if (!(data[k][0].name && this._geoCoord.hasOwnProperty(data[k][0].name))) {
                                data[k][0].name = k + 'startp';
                                self._geoCoord[data[k][0].name] = data[k][0].geoCoord;
                            }
                            if (!(data[k][1].name && this._geoCoord.hasOwnProperty(data[k][1].name))) {
                                data[k][1].name = k + 'endp';
                                self._geoCoord[data[k][1].name] = data[k][1].geoCoord;
                            }
                            self._AddPos(data[k][0]);
                            self._AddPos(data[k][1]);
                        }
                    }
                }
                // console.log(seriesIdx,markData,markType)

                self._ec._addMarkOri(seriesIdx, markData, markType);
            }

            // self._ec._addMarkOri = self._ec._addMark;
            //self._ec._addMark = _addMark;
            //console.log(self._ec)
        };

        /**
         * 获取ECharts实例
         *
         * @return {ECharts}
         * @public
         */
        self.getECharts = function() {
            return self._ec;
        };

        /**
         * 获取地图的偏移量
         *
         * @return {Array.<number>}
         * @public
         */
        self.getMapOffset = function() {
            return self._mapOffset;
        };

        /**
         * 对echarts的setOption加一次处理
         * 用来为markPoint、markLine中添加x、y坐标，需要name与geoCoord对应
         *
         * @public
         * @param option
         * @param notMerge
         */
        self.setOption = function(option, isTranslate = true, notMerge) {

            self._option = option;
            const series = option.series || [];
            if(isTranslate) {
                this._data = series.map(v=> v.data);
            } else {
                this._data.forEach( (v, i) => option.series[i].data = v);
            }
            for (let i = 0; i< series.length; i++ ) {
                if (series[i].type === 'scatter') {
                    const data = [],_data = series[i].data;
                    const bound = self._map.getBounds();

                    // sid = _data.sid,lat = _data.lat,lon = _data.lon,obs = _data.data
                    for(let i = 0; i < _data.length ;i++){
                        let latLng = L.latLng([_data[i].value[1],_data[i].value[0]])
                        if(bound.contains(latLng)) {
                            const layerXY = self.geoCoord2Pixel(latLng)
                            data.push({
                                name: _data[i].id,
                                value: [layerXY[0], layerXY[1]].concat(_data[i].value.slice(2))
                            })
                        }
                    }
                    option.series[i].data = data;
                } else if(series[i].type === 'lines') {
                    const data = series[i].data,
                        ret = [];
                    for (let i = 0; i < data.length; i++) {
                        const coords = [];
                        for (let j = 0; j < data[i].coords.length; j++) {
                            const layerXY = self.geoCoord2Pixel(L.latLng([data[i].coords[j][1], data[i].coords[j][0]]));
                            coords.push([layerXY[0], layerXY[1]]);
                        }
                        let obj = Object.assign({},data[i],{
                            coords: coords
                        });
                        ret.push(obj)
                    }
                    option.series[i].data = ret;
                } else if(series[i].type === 'flowGL') {
                    const data = series[i].data,
                        ret = [];
                    for(let i = 0; i < data.length ;i++){
                        let latLng =  L.latLng([data[i][0],data[i][1]]);
                        const layerXY = self.geoCoord2Pixel(latLng)
                        ret.push([layerXY[0], layerXY[1], ...data[i].slice(2)])
                    }
                    console.log(ret);
                    option.series[i].data = ret;

                }
            }

            self._ec.setOption(option, notMerge);

        };

        /**
         * 增加x、y坐标
         *
         * @param {Object} obj  markPoint、markLine data中的项，必须有name
         * @param {Object} geoCoord
         */
        self._AddPos = function(obj) {

            const coord = self._geoCoord[obj.name];
            const pos = self.geoCoord2Pixel(coord);
            obj.x = pos[0]; //- self._mapOffset[0];
            obj.y = pos[1]; //- self._mapOffset[1];
        };

        /**
         * 绑定地图事件的处理方法
         *
         * @private
         */
        self._bindEvent = function() {
            self._map.on('move', _moveHandler('moving'));
            self._map.on('moveend', _moveHandler('moveend'));
            self._map.on('zoomstart', function() {
                self._ec.clear();
            }); //去掉zoomstart事件
            self._map.on('zoomend', _zoomChangeHandler);
            // self._ec.getZr().on('dragstart', _dragZrenderHandler(true));
            //self._ec.getZr().on('dragend', _dragZrenderHandler(false));
            //  self._ec.getZr().on('mouseup', function() {
            // self.setOption(self._option);
            //修改了echarts源码解决了这个问题
            // });
            // self._ec.getZr().on('mousedown', function() {
            // self._ec.clear();
            //修改了echarts源码解决了这个问题
            // });
            self._ec.getZr().on('mousewheel', function(e) {
                if(self._map.getZoom()==self._map.getMaxZoom()){
                    self._ec.clear(); //在mousewheel的时候清除echarts内容
                    _zoomChangeHandler();
                }else if(self._map.getZoom()==self._map.getMinZoom()){
                    self._ec.clear(); //在mousewheel的时候清除echarts内容
                    _zoomChangeHandler();
                }
                else{
                    self._ec.clear(); //在mousewheel的时候清除echarts内容
                    self._lastMousePos = self._map.mouseEventToContainerPoint(e.event);
                    let delta = L.DomEvent.getWheelDelta(e.event);
                    const map = self._map,
                        zoom = map.getZoom();
                    delta = delta > 0 ? Math.ceil(delta) : Math.floor(delta);
                    delta = Math.max(Math.min(delta, 4), -4);
                    delta = map._limitZoom(zoom + delta) - zoom;

                    self._delta = 0;
                    self._startTime = null;

                    if (!delta) {
                        return;
                    }

                    // if (map.options.scrollWheelZoom === 'center') {
                    //     map.setZoom(zoom + delta);
                    // } else {
                    //     map.setZoomAround(self._lastMousePos, zoom + delta);
                    // }
                }

            });
        };

        /**
         * 地图缩放触发事件
         *
         * @private
         */
        function _zoomChangeHandler() {
            if(self._option.series && self._option.series.length){
                let a  = map.getZoom();
                if(task==null){
                    task=setTimeout(function(){self.setOption(self._option, false);task=null;},150);
                }else{
                    clearTimeout(task);
                    task=setTimeout(function(){self.setOption(self._option, false);task=null;},150);
                }
            }
        }

        // function _zoomatartChangeHandler() {
        //   self._ec.clear();
        // }

        /**
         * 地图移动、如拖拽触发事件
         *
         * @param {string} type moving | moveend  移动中|移动结束
         * @return {Function}
         * @private
         */
        function _moveHandler(type) {
            return function() {
                const domPosition = self._map._getMapPanePos();
                // 记录偏移量
                self._mapOffset = [-parseInt(domPosition.x) || 0, -parseInt(domPosition.y) || 0];
                self._echartsContainer.style.left = self._mapOffset[0] + 'px';
                self._echartsContainer.style.top = self._mapOffset[1] + 'px';
                //_fireEvent(type);
                if (type == 'moving') {
                    self._ec.clear();
                }
                if (type == 'moveend') {
                    _zoomChangeHandler()
                }
            }
        }

        /**
         * Zrender拖拽触发事件
         *
         * @param {boolean} isStart
         * @return {Function}
         * @private
         */
        function _dragZrenderHandler(isStart) {

            return function() {
                let func = isStart ? 'disable' : 'enable';
                if (isStart) {
                    self._ec.clear();
                } else {
                    _zoomChangeHandler()
                }
                self._map.dragging[func]();
            };
        }
    }
});
