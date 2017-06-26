require([
	"dojo/dom",
	"dojo/_base/window",
	"dojo/parser",
	"dojo/ready",
	"dojo/on",
	"dojo/dom-attr",
	"dojo/dom-class",
	"dijit/registry",
	"dojox/gauges/GlossyCircularGauge",
	"dojox/gauges/Range",
	"esri/Map",
	"esri/views/MapView",
	"esri/geometry/Extent",
	"esri/geometry/SpatialReference",
	"esri/layers/ImageryLayer",
	"esri/layers/support/RasterFunction",
	"esri/widgets/BasemapGallery",
	"esri/widgets/Expand"
],
function(
		dom, win, parser, ready, on, domAttr, domClass, registry, GlossyCircularGauge, Range,
		Map, MapView,
		Extent, SpatialReference, ImageryLayer, RasterFunction, BasemapGallery, Expand) {
	
	// CONSTS
	var windowDegrees;
	
	// MODULE LEVEL VARS
	var sliderElevation, sliderSlope, compass;
	
	var elevations = [], slopes = [], aspects=[];	// Control value sets
	var elevationSelected, slopeSelected, aspectSelected; // What attributes are checked
	var lyrImagery = new ImageryLayer({
		"url"			: "https://maps.esri.com/apl1/rest/services/avalanche/Elevation_AvalancheApp/ImageServer",
		"visible"	: false,
		"format"	: "jpgpng"
	});

	
	ready(function() {
	sliderElevation = registry.byId("sliderElevation");
	sliderSlope = registry.byId("sliderSlope");
	compass = registry.byId("aspectCompass");
	
	// parser.parse();
	windowDegrees = compass.get("windowDegrees");
	
	var chkElevation = registry.byId("chkElevation");
	on(chkElevation, "change", onElevationCheckBoxChanged);
	elevationSelected = chkElevation.checked;
	
	var chkSlope = registry.byId("chkSlope");
	on(chkSlope, "change", onSlopeCheckBoxChanged);
	slopeSelected = chkSlope.checked;
	
	var chkAspect = registry.byId("chkAspect");
	on(chkAspect, "change", onAspectCheckBoxChanged);
	aspectSelected = chkAspect.checked;
	
	on(sliderElevation, "change", onElevationValueSelected);
	sliderElevation.set("value", sliderElevation.get("value"));
	
	on(sliderSlope, "change", onSlopeValueSelected);
	sliderSlope.set("value", sliderSlope.get("value"));
	
	on(compass, "valueChanged", onAspectValueChanged);
	compass.set("value", 0);
	on(compass, "mouseUp", onAspectValueSelected);
	
	var map = new Map({ 
		basemap: "national-geographic",
		layers: [lyrImagery]
		});
	var mapView = new MapView({ 
		container: "mapDiv", 
		map: map,
		extent: new Extent({xmin:-13758747, ymin:5471107, xmax:-13025849, ymax:6092218,
												spatialReference: SpatialReference.WebMercator})
	});
	var basemapGallery = new BasemapGallery({
		view: mapView,
		container: document.createElement("div")
	});
	var bgExpand = new Expand({
		view: mapView,
		content: basemapGallery.domNode,
		expandIconClass: "esri-icon-basemap",
		container: "basemapGalleryDiv",
		expandTooltip: "Click for Basemaps"
	});
	// mapView.ui.add(bgExpand, "top-right");
	// Event handler functions
	function onElevationCheckBoxChanged(evt) {
		elevationSelected = evt;
		sliderElevation.set("disabled", !evt);
		// Recalc
		recalcRasterFunction();
	}
	function onSlopeCheckBoxChanged(evt) {
		slopeSelected = evt;
		sliderSlope.set("disabled", !evt);
		// Recalc
		recalcRasterFunction();
	}
	function onAspectCheckBoxChanged(evt) {
		aspectSelected = evt;
		// Recalc
		recalcRasterFunction();
	}
	
	function onElevationValueSelected(evt) {
		// if (!elevationSelected) return;
		elevations = [ Math.round(sliderElevation.value[0]), Math.round(sliderElevation.value[1]) ];
		dom.byId("textElevation").innerHTML = elevations[0] + "m to " + elevations[1] + "m";		
		// Recalc
		// Make sure we don't recalc on every tiny slider move while the mouse button is down
		// Workaround, since slider property "active" and events "mousedown" and "mouseup" aren't working.
		if (!domClass.contains(win.body(), "dojoMove")) recalcRasterFunction();
	}
	
	function onSlopeValueSelected(evt) {
		slopes = [ sliderSlope.value[0], sliderSlope.value[1] ];
		dom.byId("textSlope").innerHTML = slopes[0] + "° to " + slopes[1] + "°";
		// Recalc
		if (!domClass.contains(win.body(), "dojoMove")) recalcRasterFunction();
	}

	function onAspectValueChanged() {
		var value = this.value;
		
		var minVal = Math.round(this.value - (windowDegrees/2));
		if (minVal < 0) minVal += 360;
		aspects[0] = minVal;
		
		var maxVal = Math.round(this.value + (windowDegrees/2));
		if ( maxVal > 360 ) maxVal -= 360;
		aspects[1] = maxVal;
		
		dom.byId("compassAngles").innerHTML = aspects[0] + "° to " + aspects[1] + "°";

/* 		var range = new Range({"low":aspects[0], "high":aspects[1]});
		this.ranges = [range]; 
		// this.addRange(range);
		this.draw(); */
	}
	function onAspectValueSelected() {
		// Recalc
		recalcRasterFunction();
	}
	
	// Main raster function logic here
	function recalcRasterFunction() {
		console.log("RecalcRFC; elev: " + elevationSelected + ", slope: " + slopeSelected + ", aspect: " + aspectSelected);
		
		// Nothing checked = hide the layer
		if (!(elevationSelected || slopeSelected || aspectSelected)) {
			lyrImagery.visible = false;
			return;
		}
		
		// Else figure out the rendering rule and apply it
		const TINY_FLOAT_VAL = 0.00001;
		const MIN_ELEV = -10977;
		const MAX_ELEV = 8472;
		const MIN_SLOPE = 0;
		const MAX_SLOPE = 90;
		const RASTER_VAL_ELEV = 4;
		const RASTER_VAL_ASPECT = 2;
		const RASTER_VAL_SLOPE = 1;
		const RASTER_VAL_BOTH = 3;
		/* 			const MIN_ASPECT				: Number = 0;
		const MAX_ASPECT				: Number = 360; */
		const colorMapElev = [[RASTER_VAL_ELEV, 127, 127, 0]];
		const colorMapElevAspect = [[RASTER_VAL_ASPECT, 0, 0, 127]];
		const colorMapElevSlope = [[RASTER_VAL_SLOPE, 0, 127, 0]]; 
		const colorMapElevSlopeAspect = [[RASTER_VAL_BOTH, 255, 0, 0]];
		
		const RFNAME_NONE = "None";
		const RFNAME_ELEV = "Filter_Elevation_orig";
		const RFNAME_ASPECT = "Filter_Aspect_orig";
		const RFNAME_SLOPE = "Filter_Slope_orig";
		const RFNAME_SLOPEASPECT = "Filter_SlopeAspect_orig";
		const RFNAME_ELEVASPECT = "Filter_ElevationAspect_orig";
		const RFNAME_ELEVSLOPE = "Filter_ElevationSlope_orig";
		const RFNAME_ELEVSLOPEASPECT = "Filter_ElevationSlopeAspect_orig";

		// Rebuild the raster function and apply to the image service layer
		var rf = new RasterFunction();
		
		
		// Elevation
		var aryElevNoData;
		var aryElevInputVals;
		if (elevationSelected) {
			aryElevNoData = [
				MIN_ELEV + TINY_FLOAT_VAL,
				elevations[0] - 1, 
				elevations[1] + 1, 
				MAX_ELEV
			];
			aryElevInputVals = [elevations[0] + TINY_FLOAT_VAL, elevations[1]];
		}
		else {
			aryElevNoData = [];
			aryElevInputVals = [MIN_ELEV + TINY_FLOAT_VAL, MAX_ELEV];
		}
		
		
		// Slope
		var arySlopeInputRanges = [];
		var arySlopeOutputVals = [];
		if (slopes[0] <= MIN_SLOPE) {
			// Chosen lower slope bound is the min possible slope value
			arySlopeInputRanges.push(MIN_SLOPE - TINY_FLOAT_VAL, slopes[1]);
			arySlopeOutputVals.push(RASTER_VAL_SLOPE + TINY_FLOAT_VAL);
		}
		else {
			// Chosen lower slope bound greater than min possible slope value
			arySlopeInputRanges.push(MIN_SLOPE - TINY_FLOAT_VAL, slopes[0] - TINY_FLOAT_VAL, slopes[0], slopes[1]);
			arySlopeOutputVals.push(0 + TINY_FLOAT_VAL, RASTER_VAL_SLOPE);
		}
		if (slopes[1] >= MAX_SLOPE) {
			// Chosen upper slope bound is the max possible slope value
			// Do nothing, for we've already taken care of the upper chosen slope bound slopes[1]
		}
		else {
			// Chosen upper slope bound is less than max possible slope value
			arySlopeInputRanges.push(slopes[1] + TINY_FLOAT_VAL, MAX_SLOPE);
			arySlopeOutputVals.push(0);
		}

		
		// Aspect
		var aryAspectInputRanges = [];
		var aryAspectOutputVals = [];
		// Fortunately, the gauge won't return an upper bound of 0 or a lower bound of 360
		if (aspects[0] <= 0) {
			// Lowest aspect value is lowest possible aspect value (0)
			aryAspectInputRanges.push(0 + TINY_FLOAT_VAL, aspects[1], aspects[1] + 1, 360);
			aryAspectOutputVals.push(RASTER_VAL_ASPECT + TINY_FLOAT_VAL, 0);
		}
		else if (aspects[1] >= 360) {
			// Greatest aspect value is highest possible aspect value (360)
			aryAspectInputRanges.push(0 + TINY_FLOAT_VAL, aspects[0] - TINY_FLOAT_VAL, aspects[0], 360);
			aryAspectOutputVals.push(0 + TINY_FLOAT_VAL, RASTER_VAL_ASPECT);
		}
			// Otherwise, range of chosen aspects is between the extremes
		else if (aspects[0] < aspects[1]) {
			// Range doesn't cross the 0/360 boundary
			aryAspectInputRanges.push(
				0 + TINY_FLOAT_VAL, aspects[0] - TINY_FLOAT_VAL,	// Not part of range
				aspects[0], aspects[1],								// Part of range
				aspects[1] + TINY_FLOAT_VAL, 360					// Not part of range
			);
			aryAspectOutputVals.push(0 + TINY_FLOAT_VAL, RASTER_VAL_ASPECT, 0);
		}
		else {
			// Range does cross the 0/360 boundary
			aryAspectInputRanges.push(
				0 + TINY_FLOAT_VAL, aspects[1],								// Part of range
				aspects[1] + TINY_FLOAT_VAL, aspects[0] - TINY_FLOAT_VAL,	// Not part of range
				aspects[0], 360												// Part of range
			);
			aryAspectOutputVals.push(RASTER_VAL_ASPECT + TINY_FLOAT_VAL, 0, RASTER_VAL_ASPECT);
		}


		// Now build the parameters object
		
		var params = {};
		
		// None selected
/* 		if (!elevationSelected && !slopeSelected && !aspectSelected) {
			rf.functionName = _config.rasterFunctions.none;
		} */
		// Elevation only
		if (elevationSelected && !slopeSelected && !aspectSelected) {
			rf.functionName = RFNAME_ELEV;
			params["InputRanges_Elevation"] = aryElevInputVals;
			params["OutputValues_Elevation"] = [RASTER_VAL_ELEV + TINY_FLOAT_VAL];
			params["Colormap"] = colorMapElev;
		}
		// Slope only
		if (!elevationSelected && slopeSelected && !aspectSelected) {
			rf.functionName = RFNAME_SLOPE;
			params["InputRanges_Slope"] = arySlopeInputRanges;
			params["OutputValues_Slope"] = arySlopeOutputVals;
			params["Colormap"] = colorMapElevSlope;
			}
		// Aspect only 
		if (!elevationSelected && !slopeSelected && aspectSelected) {
			rf.functionName = RFNAME_ASPECT;
			params["InputRanges_Aspect"] = aryAspectInputRanges;
			params["OutputValues_Aspect"] = aryAspectOutputVals;
			params["Colormap"] = colorMapElevAspect;
		}
		// Slope, Aspect 
		if (!elevationSelected && slopeSelected && aspectSelected) {
			rf.functionName = RFNAME_SLOPEASPECT;
			params["InputRanges_Slope"] = arySlopeInputRanges;
			params["OutputValues_Slope"] = arySlopeOutputVals;
			params["InputRanges_Aspect"] = aryAspectInputRanges;
			params["OutputValues_Aspect"] = aryAspectOutputVals;
			params["Colormap"] = colorMapElevSlopeAspect;
		}
		// Elevation, Slope
		if (elevationSelected && slopeSelected && !aspectSelected) {
			rf.functionName = RFNAME_ELEVSLOPE;
			params["NoDataRanges_Elevation"] = aryElevNoData;
			params["InputRanges_Slope"] = arySlopeInputRanges;
			params["OutputValues_Slope"] = arySlopeOutputVals;
			params["Colormap"] = colorMapElevSlope;
		}
		// Elevation, Aspect
		if (elevationSelected && !slopeSelected && aspectSelected) {
			rf.functionName = RFNAME_ELEVASPECT;
			params["NoDataRanges_Elevation"] = aryElevNoData;
			params["InputRanges_Aspect"] = aryAspectInputRanges;
			params["OutputValues_Aspect"] = aryAspectOutputVals;
			params["Colormap"] = colorMapElevAspect;
		}
		// Elevation, Slope, Aspect
		if (elevationSelected && slopeSelected && aspectSelected) {
			rf.functionName = RFNAME_ELEVSLOPEASPECT;
			params["NoDataRanges_Elevation_Slope"] = aryElevNoData;
			params["NoDataRanges_Elevation_Aspect"] = aryElevNoData;
			params["InputRanges_Slope"] = arySlopeInputRanges;
			params["OutputValues_Slope"] = arySlopeOutputVals;
			params["InputRanges_Aspect"] = aryAspectInputRanges;
			params["OutputValues_Aspect"] = aryAspectOutputVals;
			params["Colormap"] = colorMapElevSlopeAspect;
		}
/* 				else if (!chkSlope.selected && !chkAspect.selected) {
			rf.functionName = _config.rasterFunctions.elev;
			params = {
				"InputRanges_ElevFilter":aryElevFilterInputVals,
				"OutputValues_ElevFilter":[RASTER_VAL_ELEV + TINY_FLOAT_VAL],
				// Color mapping
				"Colormap":colorMapElev
			};
		} */
/* 				else if (!chkSlope.selected) {
			rf.functionName = _config.rasterFunctions.elevAspect;
			params = {
				"NoDataRanges_ElevFilter":aryElevFilterNoData,
				"InputRanges_AspectFilter":aryAspectFilter,
				"OutputValues_AspectFilter":aryAspectOutputVals,
				
				// Color mapping
				"Colormap":colorMapElevAspect
			};
		} */
/* 				else if (!chkAspect.selected) {
			rf.functionName = _config.rasterFunctions.elevSlope;
			params = {
				"NoDataRanges_ElevFilter":aryElevFilterNoData,
				"InputRanges_SlopeFilter":arySlopeFilter,
				"OutputValues_SlopeFilter":arySlopeOutputVals,
				
				// Color mapping
				"Colormap":colorMapElevSlope
			};
		} */
						
		rf.functionArguments = params;			
		lyrImagery.renderingRule = rf;
		
		lyrImagery.visible = true;
	}
});
});