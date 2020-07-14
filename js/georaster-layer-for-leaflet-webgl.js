//"use strict";



var L = window.L;

var GeoRasterLayer = L.GridLayer.extend({
    options: {
        fragmentShader: "void main(void) {gl_FragColor = vec4(0.8,0.2,0.2,1.0);}",
        uniforms: {}
    },
    initialize: function initialize(options) {
        try {
            console.log("starting GeoRasterLayer.initialize with", options);

            if (!options.keepBuffer) options.keepBuffer = 25;

            if (!options.resolution) options.resolution = Math.pow(2, 5);

            if (options.updateWhenZooming === undefined) options.updateWhenZooming = false;

            var georaster = options.georaster;
            this.georaster = georaster;

            this.scale =  options.color?options.color:chroma.scale('RdYlBu');


            /*
                Unpacking values for use later.
                We do this in order to increase speed.
            */
            this._maxs = georaster.maxs;
            this._mins = georaster.mins;
            this._ranges = georaster.ranges;
            this._no_data_value = georaster.no_data_value;
            this._pixelWidth = georaster.pixelWidth;
            this._pixelHeight = georaster.pixelHeight;
            this._rasters = georaster.values;
            this._tiff_width = georaster.width;
            this._tiff_height = georaster.height;
            this._xmin = georaster.xmin;
            this._ymin = georaster.ymin;
            this._xmax = georaster.xmax;
            this._ymax = georaster.ymax;
            this._map = null
            this._popup = L.popup();


            var southWest = L.latLng(georaster.ymin, georaster.xmin);
            var northEast = L.latLng(georaster.ymax, georaster.xmax);
            this._bounds = L.latLngBounds(southWest, northEast);

            options.bounds = this._bounds;
            L.setOptions(this, options);

            /*
                Caching the constant tile size, so we don't recalculate everytime we
                create a new tile
            */
            var tileSize = this.getTileSize();

            this._tile_height = tileSize.y;
            this._tile_width = tileSize.x;

            this._renderer =  L.DomUtil.create("canvas");
            this._renderer.width = this._renderer.height = this._tile_width;
            this._glError = false;
            const gl = (this._gl =
                this._renderer.getContext("webgl", {
                    //premultipliedAlpha: false,
                }) ||
                this._renderer.getContext("experimental-webgl", {
                    premultipliedAlpha: false,
                }));
            gl.viewportWidth = options.tileSize;
            gl.viewportHeight = options.tileSize;
            this._loadGLProgram();
            this._texture = gl.createTexture();
            gl.uniform1i(gl.getUniformLocation(this._glProgram, "uTexture0"), 0);
        } catch (error) {
            console.error("ERROR initializing GeoTIFFLayer", error);
        }
    },

    createTile: function createTile(coords) {
        const tile = L.DomUtil.create("canvas", "leaflet-tile");
        tile.width = tile.height = this._tile_height;
        tile.onselectstart = tile.onmousemove = L.Util.falseFn;
        const key = this._tileCoordsToKey(coords);

        const ctx = tile.getContext("2d");
        setTimeout(()=> {
            const imageData  = ctx
                .createImageData(tile.width/2, tile.height/2);

            const bounds = this._tileCoordsToBounds(coords);

            //if (debug_level >= 1) console.log("bounds:", bounds);

            const xmin_of_tile = bounds.getWest();
            const xmax_of_tile = bounds.getEast();
            const ymin_of_tile = bounds.getSouth();
            const ymax_of_tile = bounds.getNorth();
            const {_ymin, _xmin, _xmax,_ymax,_pixelWidth, _pixelHeight} = this;

            const height_of_rectangle_in_degrees = (ymax_of_tile - ymin_of_tile) /  tile.height * 2;

            const width_of_rectangle_in_degrees = (xmax_of_tile - xmin_of_tile) / tile.width * 2;

            let count = 0;
            const data = new Uint8ClampedArray(tile.height* tile.width);
            for (let h = 0; h < tile.height/2; h++) {
                const lat = ymax_of_tile - (h + 0.5) * height_of_rectangle_in_degrees;

                for (let w = 0; w < tile.width/2; w++) {
                    const lng = xmin_of_tile + (w + 0.5) * width_of_rectangle_in_degrees;
                    if (lat > _ymin && lat < _ymax && lng > _xmin && lng < _xmax
                    ) {
                        // let x_in_raster_pixels = Math.floor((lng - _xmin) / _pixelWidth);
                        // let y_in_raster_pixels = Math.floor((_ymax - lat) / _pixelHeight);
                        //let value = rasters.map(raster => raster[y_in_raster_pixels][x_in_raster_pixels])[0];
                        let value = this.interpolatedValueAtIndexes((lng - _xmin) / _pixelWidth, (_ymax - lat) / _pixelHeight);
                        if (value  && !isNaN(value) && value < 999) {
                            const [r, g, b, a] = this.options.pixelValueToColorFn(value);
                            //console.log(r,g,b,a, count);
                            data[count] = r;
                            data[count + 1] = g;
                            data[count + 2] = b;
                            data[count + 3] = a;
                        }else {
                            // data.push(0,0,0,0);
                            data[count] = 0;
                            data[count + 1] = 0;
                            data[count + 2] = 0;
                            data[count + 3] = 0;
                        }
                    } else {
                        // data.push(0,0,0,0);
                        data[count] = 0;
                        data[count + 1] = 0;
                        data[count + 2] = 0;
                        data[count + 3] = 0;
                    }
                    count+=4;
                }
            }
            imageData.data.set(data);

            if(this._isReRenderable) {
                this._fetchedTextures[key] = imageData;
                this._2dContexts[key] = ctx;
            }
            this._bindTexture(imageData);
            this._render(coords);
            ctx.drawImage(this._renderer, 0, 0);
        },0)

        return tile;

    },
    interpolatedValueAtIndexes(i,j){
        const raster = this._rasters[0]
        let tiff_width = this._tiff_width
        let tiff_height = this._tiff_height;
        let fi,fj,ci,cj
        let g00, g10, g01, g11
        if(i >= tiff_width - 1){
            fi = ci =  tiff_width - 1
        }else{
            fi = Math.floor(i)
            ci = fi + 1
        }
        if(j >= tiff_height - 1){
            fj = cj =  tiff_height - 1
        }else{
            fj = Math.floor(j)
            cj = fj + 1
        }
        const row0 = raster[fj]
        g00 = row0[fi]
        g10 = row0[ci];

        const row1 = raster[cj]

        g01 = row1[fi]
        g11 = row1[ci];
        return this._doInterpolation(i-fi,j-fj,g00, g10, g01, g11)
    },
    /**
     * Bilinear interpolation for Number
     * https://en.wikipedia.org/wiki/Bilinear_interpolation
     * @param   {Number} x
     * @param   {Number} y
     * @param   {Number} g00
     * @param   {Number} g10
     * @param   {Number} g01
     * @param   {Number} g11
     * @returns {Number}
     */
    _doInterpolation(x, y, g00, g10, g01, g11) {
        var rx = 1 - x;
        var ry = 1 - y;
        return g00 * rx * ry + g10 * x * ry + g01 * rx * y + g11 * x * y;
    },

    getBounds: function getBounds() {
        return this._bounds;
    },

    getColor: function getColor(name) {
        var d = document.createElement("div");
        d.style.color = name;
        document.body.appendChild(d);
        return window.getComputedStyle(d).color;
    },
    onLayerDidMount:function() {
        this._map.on('click', this._onClick, this);
    },
    _onClick:function(e){
        this._queryvalue(e)
        this.fire('click', e);
    },
    _queryvalue(e){
        let xmin = this._xmin;
        let ymin = this._ymin;
        let xmax = this._xmax;
        let ymax = this._ymax;
        let pixelWidth = this._pixelWidth;
        let pixelHeight = this._pixelHeight;
        let lng = e.latlng.lng
        let lat = e.latlng.lat
        let rasters = this._rasters[0]
        const map = this._map
        // return ;
        if(lat> ymin && lat <ymax && lng >xmin && lng <xmax){
            let x_pixels = Math.floor((lng - xmin) / pixelWidth);
            let y_pixels = Math.floor((ymax - lat) / pixelHeight);
            const value =  rasters[y_pixels][x_pixels]
            this._popup.setLatLng(e.latlng)
                .setContent(+(value - 273.15).toFixed(1)+'℃')
                //.setContent(+(value - 273.15).toFixed(1)+'℃')
                .openOn(map);
        }
    },
    onAdd:function(map){
        this._map = map
        L.GridLayer.prototype.onAdd.call(this, map);
        this.onLayerDidMount()
    },



    _loadGLProgram: function() {
        var gl = this._gl;

        // Force using this vertex shader.
        // Just copy all attributes to predefined variants and set the vertex positions
        var vertexShaderCode =
            "attribute vec2 aVertexCoords;  " +
            "attribute vec2 aTextureCoords;  " +
            "attribute vec2 aCRSCoords;  " +
            "attribute vec2 aLatLngCoords;  " +
            "varying vec2 vTextureCoords;  " +
            "varying vec2 vCRSCoords;  " +
            "varying vec2 vLatLngCoords;  " +
            "void main(void) {  " +
            "	gl_Position = vec4(aVertexCoords , 1.0, 1.0);  " +
            "	vTextureCoords = aTextureCoords;  " +
            "	vCRSCoords = aCRSCoords;  " +
            "	vLatLngCoords = aLatLngCoords;  " +
            "}";

        // Force using this bit for the fragment shader. All fragment shaders
        // will use the same predefined variants, and
        let fragmentShaderHeader =
            "precision highp float;\n" +
            "uniform float uNow;\n" +
            "uniform vec3 uTileCoords;\n" +
            "varying vec2 vTextureCoords;\n" +
            "varying vec2 vCRSCoords;\n" +
            "varying vec2 vLatLngCoords;\n"+
            "uniform sampler2D uTexture0;\n";

        fragmentShaderHeader += this._getUniformSizes();

        var program = (this._glProgram = gl.createProgram());
        var vertexShader = gl.createShader(gl.VERTEX_SHADER);
        var fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(vertexShader, vertexShaderCode);
        gl.shaderSource(fragmentShader, fragmentShaderHeader + this.options.fragmentShader);
        gl.compileShader(vertexShader);
        gl.compileShader(fragmentShader);

        // @event shaderError
        // Fired when there was an error creating the shaders.
        if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
            this._glError = gl.getShaderInfoLog(vertexShader);
            console.error(this._glError);
            return null;
        }
        if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
            this._glError = gl.getShaderInfoLog(fragmentShader);
            console.error(this._glError);
            return null;
        }

        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        gl.useProgram(program);

        // There will be four vec2 vertex attributes per vertex:
        // aVertexCoords (always from -1 to +1), aTextureCoords (always from 0 to +1),
        // aLatLngCoords and aCRSCoords (both geographical and per-tile).
        this._aVertexPosition = gl.getAttribLocation(program, "aVertexCoords");
        this._aTexPosition = gl.getAttribLocation(program, "aTextureCoords");
        this._aCRSPosition = gl.getAttribLocation(program, "aCRSCoords");
        this._aLatLngPosition = gl.getAttribLocation(program, "aLatLngCoords");

        this._initUniforms(program);

        // If the shader is time-dependent (i.e. animated), or has custom uniforms,
        // init the texture cache
        if (this._isReRenderable) {
            this._fetchedTextures = {};
            this._2dContexts = {};
        }

        // 		console.log('Tex position: ', this._aTexPosition);
        // 		console.log('CRS position: ', this._aCRSPosition);
        // 		console.log("uNow position: ", this._uNowPosition);

        // Create three data buffer with 8 elements each - the (easting,northing)
        // CRS coords, the (s,t) texture coords and the viewport coords for each
        // of the 4 vertices
        // Data for the texel and viewport coords is totally static, and
        // needs to be declared only once.
        this._CRSBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this._CRSBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(8), gl.STATIC_DRAW);
        if (this._aCRSPosition !== -1) {
            gl.enableVertexAttribArray(this._aCRSPosition);
            gl.vertexAttribPointer(this._aCRSPosition, 2, gl.FLOAT, false, 8, 0);
        }

        this._LatLngBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this._LatLngBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(8), gl.STATIC_DRAW);
        if (this._aLatLngPosition !== -1) {
            gl.enableVertexAttribArray(this._aLatLngPosition);
            gl.vertexAttribPointer(this._aLatLngPosition, 2, gl.FLOAT, false, 8, 0);
        }

        this._TexCoordsBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this._TexCoordsBuffer);

        // prettier-ignore
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            1.0, 0.0,
            0.0, 0.0,
            1.0, 1.0,
            0.0, 1.0,
        ]), gl.STATIC_DRAW);
        if (this._aTexPosition !== -1) {
            gl.enableVertexAttribArray(this._aTexPosition);
            gl.vertexAttribPointer(this._aTexPosition, 2, gl.FLOAT, false, 8, 0);
        }

        this._VertexCoordsBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this._VertexCoordsBuffer);

        // prettier-ignore
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            1,  1,
            -1,  1,
            1, -1,
            -1, -1
        ]), gl.STATIC_DRAW);
        if (this._aVertexPosition !== -1) {
            gl.enableVertexAttribArray(this._aVertexPosition);
            gl.vertexAttribPointer(this._aVertexPosition, 2, gl.FLOAT, false, 8, 0);
        }
    },
    _getUniformSizes() {
        let defs = "";
        this._uniformSizes = {};
        for (var uniformName in this.options.uniforms) {
            var defaultValue = this.options.uniforms[uniformName];
            if (typeof defaultValue === "number") {
                this._uniformSizes[uniformName] = 0;
                defs += "uniform float " + uniformName + ";\n";
            } else if (defaultValue instanceof Array) {
                if (defaultValue.length > 4) {
                    throw new Error("Max size for uniform value is 4 elements");
                }
                this._uniformSizes[uniformName] = defaultValue.length;
                if (defaultValue.length === 1) {
                    defs += "uniform float " + uniformName + ";\n";
                } else {
                    defs += "uniform vec" + defaultValue.length + " " + uniformName + ";\n";
                }
            } else {
                throw new Error(
                    "Default value for uniforms must be either number or array of numbers"
                );
            }
        }
        return defs;
    },

    _initUniforms(program) {
        const gl = this._gl;
        this._uTileCoordsPosition = gl.getUniformLocation(program, "uTileCoords");
        this._uNowPosition = gl.getUniformLocation(program, "uNow");
        this._isReRenderable = false;

        if (this._uNowPosition) {
            gl.uniform1f(this._uNowPosition, performance.now());
            this._isReRenderable = true;
        }

        this._uniformLocations = {};
        for (var uniformName in this.options.uniforms) {
            this._uniformLocations[uniformName] = gl.getUniformLocation(program, uniformName);
            this.setUniform(uniformName, this.options.uniforms[uniformName]);
            this._isReRenderable = true;
        }
    },
    // Sets the value(s) for a uniform.
    setUniform(name, value) {
        switch (this._uniformSizes[name]) {
            case 0:
                this._gl.uniform1f(this._uniformLocations[name], value);
                break;
            case 1:
                this._gl.uniform1fv(this._uniformLocations[name], value);
                break;
            case 2:
                this._gl.uniform2fv(this._uniformLocations[name], value);
                break;
            case 3:
                this._gl.uniform3fv(this._uniformLocations[name], value);
                break;
            case 4:
                this._gl.uniform4fv(this._uniformLocations[name], value);
                break;
        }
    },


    _bindTexture: function(imageData) {
        // Helper function. Binds a ImageData (HTMLImageElement, HTMLCanvasElement or
        // ImageBitmap) to a texture, given its index (0 to 7).
        // The image data is assumed to be in RGBA format.
        const gl = this._gl;
            //console.log(this._texture, gl.TEXTURE0, imageData, '_bindTexture')
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this._texture);

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST);
         gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        //gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        // Set the texture image

        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imageData);
        gl.generateMipmap(gl.TEXTURE_2D);
    },
    _render: function(coords) {

        const gl = this._gl;
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        gl.clearColor(0.5, 0.5, 0.5, 0);
        //gl.enable(gl.BLEND);

        const tileBounds = this._tileCoordsToBounds(coords);
        const west = tileBounds.getWest(),
            east = tileBounds.getEast(),
            north = tileBounds.getNorth(),
            south = tileBounds.getSouth();

        // Create data array for LatLng buffer
        // prettier-ignore
        const latLngData = [
            // Vertex 0
            east, north,

            // Vertex 1
            west, north,

            // Vertex 2
            east, south,

            // Vertex 3
            west, south,
        ];

        // ...upload them to the GPU...
        gl.bindBuffer(gl.ARRAY_BUFFER, this._LatLngBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(latLngData), gl.STATIC_DRAW);

        // ...also create data array for CRS buffer...
        // Kinda inefficient, but doesn't look performance-critical
        const crs = this._map.options.crs,
            min = crs.project(L.latLng(south, west)),
            max = crs.project(L.latLng(north, east));

        // prettier-ignore
        const crsData = [
            // Vertex 0
            max.x, max.y,

            // Vertex 1
            min.x, max.y,

            // Vertex 2
            max.x, min.y,

            // Vertex 3
            min.x, min.y,
        ];

        // ...and also upload that to the GPU...
        gl.bindBuffer(gl.ARRAY_BUFFER, this._CRSBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(crsData), gl.STATIC_DRAW);

        // ...and also set the uTileCoords uniform for this tile
        gl.uniform3f(this._uTileCoordsPosition, coords.x, coords.y, coords.z);

        // ... and then the magic happens.
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    setRaster(georaster) {
        this.georaster = georaster;
        this._maxs = georaster.maxs;
        this._mins = georaster.mins;
        this._ranges = georaster.ranges;
        this._no_data_value = georaster.no_data_value;
        this._pixelWidth = georaster.pixelWidth;
        this._pixelHeight = georaster.pixelHeight;
        this._rasters = georaster.values;
        this._tiff_width = georaster.width;
        this._tiff_height = georaster.height;
        this._xmin = georaster.xmin;
        this._ymin = georaster.ymin;
        this._xmax = georaster.xmax;
        this._ymax = georaster.ymax;
        this.redraw();
    }
});

if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = GeoRasterLayer;
}
if (typeof window !== "undefined") {
    window["GeoRasterLayer"] = GeoRasterLayer;
} else if (typeof self !== "undefined") {
    self["GeoRasterLayer"] = GeoRasterLayer; // jshint ignore:line
}
