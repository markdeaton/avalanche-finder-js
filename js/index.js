require([
	"dojo/dom",
	"dojo/parser",
	"dojo/ready",
	"dojo/on",
	"dijit/registry",
	"dojox/gauges/GlossyCircularGauge",
	"esri/Map",
	"esri/views/MapView",
	"esri/geometry/Extent",
	"esri/geometry/SpatialReference"
],
function(
		dom, parser, ready, on, registry, GlossyCircularGauge, 
		Map, MapView,
		Extent, SpatialReference) {
	
	// CONSTS
	var windowDegrees;

	ready(function() {
	// parser.parse();
	windowDegrees = registry.byId("aspectCompass").get("windowDegrees");
	
	var compass = registry.byId("aspectCompass");
	on(compass, "valueChanged", onCompassValueChanged);
	compass.set("value", 0);
	
	var map = new Map({ basemap: "national-geographic" });
	var mapView = new MapView({ 
		container: "mapDiv", 
		map: map,
		extent: new Extent({xmin:-13758747, ymin:5471107, xmax:-13025849, ymax:6092218,
												spatialReference: SpatialReference.WebMercator})
	});
	
	function onCompassValueChanged() {
		var value = this.value;
		
		var minVal = Math.round(this.value - (windowDegrees/2));
		if (minVal < 0) minVal += 360;
		var maxVal = Math.round(this.value + (windowDegrees/2));
		if ( maxVal > 360 ) maxVal -= 360;
		
		dom.byId("compassAngles").innerHTML = minVal + "° - " + maxVal + "°";
	}
});
});