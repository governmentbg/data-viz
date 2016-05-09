$(function(){

	queue()
		.defer(d3.json, "../assets/topojson/bg-oblasti-simple.json")
		.defer(d3.csv, "../assets/data/crime/mvr-aggr-13-perth.csv")
		.defer(d3.csv, "../assets/data/crime/mvr-aggr-13-prc.csv")
		.defer(d3.json, "../assets/data/crime/recoded-en-bg-crime.json")
		.await(ready);

	function toPrcObj (items){
  	var prev = 0,
  			res = {};
		
		for (_ in items){	
			if ( _ == Object.keys(items)[0]){
				prev = items[_]
			}else{
				res[_] = (items[_]/prev - 1) * 100
				prev = items[_]
			}
		}

	  return res
	};

	function filterByCriteria (obj,field, criteria){
	  var found_names = $.grep(obj, function(v) {
	      return ($.inArray(v[field],criteria)>-1);
	  });
	  return found_names
	};

  function filterByCriteriaSelectKeyAndField (items, field, criteria, selectKey, selectField){
  	o = {}
  	
  	$.map(items, function(item){
	    if ($.inArray(item[field], criteria) > -1){
	    	_ = {}
	    	_[item[selectKey]] = +item[selectField]
	    	$.extend(o,_)
	    	return o;
	    }else{
	      return null;
	    }
	  })

	  return o
	};

  function mergeTwoKeyAndFieldArrays (items1, items2){
  	return $.map(items1, function(item1){
  		return $.map(items2, function(item2){
  				if (item1[0] === item2[0]){
	    			return [[].concat(item1).concat(item2[1])];
	    		}else{
	      		return null;
	    		}
  			})
	   })
	};

	function filterByTwoCriteriaSelectField (items,field1, criteria1,field2, criteria2, selectField){
	  return $.map(items, function(item){ 
	    if ($.inArray(item[field1], criteria1) > -1 && $.inArray(item[field2], criteria2) > -1){
	      return item[selectField];
	    }else{
	      return null;
	    }
	  })
	};

	function getField(obj, field ,convertToNumber){
		return $.map(obj, function(n, i){ return convertToNumber ? +n[field] : n[field]; });
	};


	function updateMapTitle(y, c){
		$('#maptitle').text('Карта на престъпността в страната за ' + y + ' година : ' + c )
		return		
	}


	function updateFirstTitle(y){
		$('#firstRowTitle').text('Престъпност и разкриваемост по области за ' + y + ' година')
		return		
	}

	function updateSecondTitle(o){
		$('#secondRowTitle').text('Динамика на престъпността и разкриваемостта в ' + o)
		return		
	}


	var dispatch = d3.dispatch('load','yearChange','sortBarChartO','sortBarChartR','oblastFocus')

	var smallMobile = false;

	var height = $(window).height()*0.5;
	var width = $(window).width() >= 980 ? 900 : $(window).width()*0.9;


  // handle small mobile devices
  if($(window).width() <= $(window).height() || $(window).width() < 600){
    smallMobile = true
    if ($(window).height() < 400){
    	height = $(window).height()*0.8
    }else{
    	height = $(window).height()*0.6
    }
  }

  // Laptop
  if($(window).height() < 610 && $(window).width() > 1000){
  	height = $(window).height()*0.8
  }

	// var tileColors = ['#ff1004','#fe7871','#92a2b5','#5c7390'];
  var tileColors = ['#ff1004','#ff5262','#d1b60d','#14bb11'];
	var tileColorsDividers = [100, 50, 30, 0];

	var circleColors = ['#fe1e13','#dfbe10','#91bb11'];
	var circleColorsDividers = [0, 60, 100];


	// External interface
	var initialYear=2000,
		currentYear=2000,
		lastYear=2014,
		years = [];

	for (var i = initialYear; i <= lastYear; i++) { years.push(i); }

	var oblasts = ["Благоевград", "Бургас", "Варна", "Велико Търново", "Видин", "Враца", "Габрово", "Добрич", "Кърджали", "Кюстендил", "Ловеч", "Монтана", "Пазарджик", "Перник", "Плевен", "Пловдив" , "Разград", "Русе", "Силистра", "Сливен", "Смолян", "София  град", "София", "Стара Загора", "Търговище", "Хасково", "Шумен", "Ямбол", 'Общo']

	var targetVar = '0',
			selectedOblast = 'Общo';

	$('#firstRowTitle').text('Престъпност и разкриваемост по области за ' + currentYear + ' година')
	$('#secondRowTitle').text('Динамика на престъпността и разкриваемостта в ' + selectedOblast)

	var isPlaying = false,
		isSliding = false;

	// Handlers
	var slider;

	var projection = d3.geo.mercator();
	var map = void 0;

	var path = d3.geo.path().projection(projection);

	var svg = d3.select("#map-container")
	    .append("svg")
	    .attr("width", '100%')
	    .attr("height", height);

	// Scales and formats
	var occurenceRescale = d3.scale.linear()

	var colorScale = d3.scale.linear()
    					.domain(tileColorsDividers)
    					.range(tileColors)

// Scales and formats
	var colorCircleScale = d3.scale.linear()
    					.domain(circleColorsDividers)
    					.range(circleColors)

	var circleScale = d3.scale.linear()
					.domain([0, 100])
					.range([height*0.06, height*0.02])

	var formatYear = d3.format("04d"),
			formatPrc = d3.format("0.00%"),
			format0 = d3.format("0f");

	var legendBubble = d3.select('#mapbublelegend')
		.append('svg')
		.attr('class', 'legend-bubble')
	    .attr("width", width*0.3)
	    .attr("height", height*0.15);

	var legendCircles = legendBubble.selectAll('svg')
		.data([20,40,60,80])

	var legendCircleEnter = legendCircles.enter()
		.append("g")
		.attr("transform", function(d,i){ return "translate(" + (height*0.15 + i*2*circleScale(d/1.8)) + ",36)"});

	legendCircleEnter
		.append('circle')
			.attr("r", function(d) { return circleScale(d); })
			.attr("fill", function(d) { return colorCircleScale(d); });

	legendCircleEnter
		.append('text')
		.attr("dx", -15)
		.attr("dy", 5)
			.text(function(d) { return formatPrc(d/100); });


	function ready(error, geodata, crimeOccurenceData, crimeRevealData, recodeBG) {
		if (error) throw error;

		// Slider

		// Add slider
		createSlider();

		// // Add play button
		d3.select("#play")
	      .attr("title","Play animation")
	      .on("click",function(){
	        if ( !isPlaying ){
	        	// Start over
	        	if(currentYear==lastYear){ currentYear=initialYear-1 }
	          isPlaying = true;
	          d3.select(this).classed("pause",true).attr("title","Pause animation");
	          animate();
	        } else {
	          isPlaying = false;
	          d3.select(this).classed("pause",false).attr("title","Play animation");
	          clearInterval( interval );
	        }
  		});

		// create data views for current target

	  	var situationByYear = d3.map();
	  	var situationByOblast = d3.map();
	  	var revealedByYear = d3.map();
	  	var revealByOblast = d3.map();
		  

		function createViews(target){


		  years.forEach(function(d) { 
		  	situationByYear.set(d, 
		  		filterByCriteriaSelectKeyAndField(crimeOccurenceData,'Year',[d.toString()],'Oblast',targetVar));

		  	revealedByYear.set(d, 
		  		filterByCriteriaSelectKeyAndField(crimeRevealData,'Year',[d.toString()],'Oblast',targetVar));

		  });

		  oblasts.forEach(function(d) { 
		  	situationByOblast.set(d, 
		  		filterByCriteriaSelectKeyAndField(crimeOccurenceData,'Oblast',[d],'Year',targetVar));

		  	revealByOblast.set(d, 
		  		filterByCriteriaSelectKeyAndField(crimeRevealData,'Oblast',[d],'Year',targetVar));

		  });

		};

		createViews(targetVar);

		// A bar chart to show crime rates per Oblast and Total ; uses the "bars" namespace.
		dispatch.on("load.obars", function(occured, revealed) {
			
			var w = $('#barChartOccured').width();
			var barChartOccured = sortedBarChart().data(situationByYear.get(currentYear))
				.width(w)
				.height(400)
				.formatType(',.0f');

			var barChartRevealed = sortedBarChart().data(revealedByYear.get(currentYear))
				.width(w)
				.height(400)
				.formatType('%');

    	dispatch.on("yearChange.obars", function(occured, revealed) {
				barChartOccured.data(occured);
				barChartRevealed.data(revealed);
      });

      dispatch.on("sortBarChartO.obars", function(v) {
				barChartOccured.sortData(v);
				// barChartRevealed.sortData(v);
      });

      dispatch.on("sortBarChartR.obars", function(v) {
				// barChartOccured.sortData(v);
				barChartRevealed.sortData(v);
      });

      d3.select("#barChartOccured").call(barChartOccured);
			d3.select("#barChartRevealed").call(barChartRevealed);

			highlightBar = function(selection, highlight){
				selection.each(function(d){
					d3.select(this)
        		.style('fill', function(v) { return highlight == v[0] ? '#f0f059' : '' });
				})
			}

		});


		 // A bar chart to show crime levels and reveal rate of a selected Oblast for the full time period; uses the "lines" namespace.
		dispatch.on("load.lines", function(data, highlight) {

			var w = $('#dualLineChartTotals').width()

			var dualLineChartTotals = dualLineChart().data([situationByOblast.get(selectedOblast), revealByOblast.get(selectedOblast)]).width(w);
			var multiLineChartPrcs = multiLineChart()
				.data(
					{
						'ръст престъпност' : toPrcObj(situationByOblast.get(selectedOblast)),
						'ръст разкрития' : toPrcObj(revealByOblast.get(selectedOblast))
					}
				)
				.width(w);

			d3.select("#dualLineChartTotals").call(dualLineChartTotals);
			d3.select("#multiLineChartPrcs").call(multiLineChartPrcs);

    	dispatch.on("oblastFocus.lines", function(occurence, revealed) {

    		dualLineChartTotals.data([occurence, revealed]);
    		multiLineChartPrcs.data(
    			{
						'ръст престъпност' : toPrcObj(occurence),
						'ръст разкрития' : toPrcObj(revealed)
					});


      });
		});  


		dispatch.load();

		dispatch.yearChange(situationByYear.get(currentYear), revealedByYear.get(currentYear));
		dispatch.oblastFocus(situationByOblast.get(selectedOblast), revealByOblast.get(selectedOblast), selectedOblast);


		// Add options to hard-coded menu

    $('.navbar-nav a')
      .on('click', function(event) {
        updateCrime(recodeBG['crimes'][this.text])
      });


		function updateCrime(code){
			targetVar = code;
			updateMapTitle(currentYear, recodeBG['crimes-inv'][targetVar])
			occurenceColorCode(targetVar);
			updateColorCodeAndDictionary(currentYear,targetVar);
			createViews(targetVar);
			dispatch.yearChange(situationByYear.get(currentYear), revealedByYear.get(currentYear));
			dispatch.oblastFocus(situationByOblast.get(selectedOblast), revealByOblast.get(selectedOblast), selectedOblast);
			if( d3.select("#barChartOccuredSort").property("checked") ){
				dispatch.sortBarChartO(true);
			}

			if( d3.select("#barChartRevealedSort").property("checked") ){
				dispatch.sortBarChartR(true);
			}
		}



		// add ranking functionality

		d3.select("#barChartOccuredSort").on("change", function(){
			dispatch.sortBarChartO(this.checked);
			return
		});

		d3.select("#barChartRevealedSort").on("change", function(){
			dispatch.sortBarChartR(this.checked);
			return
		});


		// draw main map

    var regions = topojson.feature(geodata, geodata.objects.regions);
    var box = d3.select("#map-container").node().getBoundingClientRect()
    var w = box.width;
    var h = box.height;
    var b, s, t;
    projection.scale(1).translate([0, 0]);
    var b = path.bounds(regions);
    var s = .9 / Math.max((b[1][0] - b[0][0]) / w, (b[1][1] - b[0][1]) / h);
    var t = [(w - s * (b[1][0] + b[0][0])) / 2, (h - s * (b[1][1] + b[0][1])) / 2];
    projection.scale(s).translate(t);

    map = svg.append('g').attr('class', 'boundary');
    region = map.selectAll('.region').data(regions.features);

		var _dataDict = {};
		var _centroids = {};

		// Tooltip Handler
		var tooltip = d3.select("#path-tooltip")

		// Legend Handler
		var legend = d3.select('#mapregionlegend')
			.append('ul')
		.attr('class', 'list-inline');


    region.enter()
        .append('path')
        .attr('class', 'region')
        .attr('d', path)
        .attr("id",function(d,i){ return d.properties.oblast.replace(" ", "")})
        ///
        ///
        ///
/*        .on("mouseover", function(d) {
        			var oblastBG = recodeBG['oblasti'][d.properties.oblast];
          	tooltip.select("#path-oblast").text("Област: " +
          		oblastBG)
          	tooltip.select("#path-value").text("Процент: " +
          		filterByTwoCriteriaSelectField(crimeOccurenceData,'Oblast',[oblastBG],'Year',[currentYear.toString()],targetVar)[0])
          	tooltip.select("#path-year").text("Година: " + currentYear)
          	return tooltip
          		.transition()
            	.duration(50)
            	.style("opacity", 0.9);
        })
        .on("mousemove", function(d) {
          	return tooltip
            	.style("top", (d3.event.pageY-10)+"px")
            	.style("left", (d3.event.pageX+10)+"px");
        })
        .on("mouseout", function(){return tooltip.style("opacity", 0);})*/
	      ///
	      ///
	      ///
	      .on('click', function(d){
        		clickedOblast(d)
        });

    occurenceColorCode(targetVar);
    updateColorCodeAndDictionary(initialYear, targetVar);
    
    d3.selectAll('.region').each(function(d){
    	var elemEnter = map
		    .append("g")
		    .attr("transform", function(l){
		    	var currentOblast = d.properties.oblast,
		    		_dx = 0,
		    		_dy = 0,
		    		currentId = '#' + currentOblast.replace(" ", ""),
    				currentRegion = d3.select(currentId),
    				currentCentroid = path.centroid(currentRegion.datum());

    			if(currentOblast === 'Sofia'){
    				_dx = currentCentroid[0] * 0.15
    				_dy = -currentCentroid[1] * 0.05
    			}

		    	return "translate(" + (currentCentroid[0] + _dx) + "," 
		    		+ (currentCentroid[1] + _dy) + ")"
		    })

	    elemEnter
	    	.append("circle")
	      	.attr("r", circleScale( _dataDict[d.properties.oblast] ) )
	      	.attr("id", 'cir' + d.properties.oblast.replace(" ", "") )
	      	.attr("fill", colorCircleScale( _dataDict[d.properties.oblast] ));

	  	elemEnter
	    		.append('text')
	    		.attr("id", 'ctxt' + d.properties.oblast.replace(" ", "") )
	    		.attr("dx", function(d){return -15})
	    		.attr("dy", function(d){return 5})
	    		.text( formatPrc(_dataDict[d.properties.oblast]/100) );
    })

		function clickedOblast(d){

			var oblastBG = recodeBG['oblasti'][d.properties.oblast];
			


			if (oblastBG && selectedOblast !== oblastBG) {

        selectedOblast = oblastBG;
        
		  	updateSecondTitle(selectedOblast)
		  	dispatch.oblastFocus(situationByOblast.get(selectedOblast), revealByOblast.get(selectedOblast),selectedOblast);
		  	highlightBar( d3.select("#barChartOccured").selectAll('rect'),selectedOblast);
		  	highlightBar( d3.select("#barChartRevealed").selectAll('rect'),selectedOblast);
		  	

      } else {


      }

		}

		function occurenceColorCode(target){
			var fieldRange = getField(crimeOccurenceData, target, true)

			// update the occurenceRescale
			occurenceRescale
				.domain([ d3.min(fieldRange), d3.max(fieldRange) ])
    	.range([0, 100])

    	// update color legend
	    var colorLegend = {};
	    for (i=0; i<tileColors.length; i++){
	    	colorLegend[tileColors[i]]=occurenceRescale.invert(tileColorsDividers[i]);
	    }
	    
	    var legendKeys = legend.selectAll('li.key')
        .data(tileColorsDividers);
    
			legendKeys.enter().append('li')
        .attr('class', 'key')
        .style('border-top-color', function(d){ return colorScale(d) });

		  legendKeys
			  .text(function(d) { 
			    var r = colorLegend[colorScale(d)];
			    return format0(r);
				});

		}

		function updateColorCodeAndDictionary(year,target){
    
			region
				.transition()
				.duration(1000)
				.style("fill", function(d){

					var oblastBG = recodeBG['oblasti'][d.properties.oblast];
					var value = +filterByTwoCriteriaSelectField(crimeOccurenceData,'Oblast',[oblastBG],'Year',[year.toString()],target)[0];
					_dataDict[d.properties.oblast] = +filterByTwoCriteriaSelectField(crimeRevealData,'Oblast',[oblastBG],'Year',[year.toString()],target)[0];

					return value != undefined ? colorScale(occurenceRescale(value)) : '#cccccc';
		    });


			d3.selectAll('.region').each(function(d){

				var currentOblast = d.properties.oblast;
				var currentCircleID = '#cir' + currentOblast.replace(" ", "")
				var currentTxtID = '#ctxt' + currentOblast.replace(" ", "")

				d3.select(currentCircleID)
					.transition()
					.duration(1000)
					.attr("r", circleScale( _dataDict[currentOblast] ) )
					.attr("fill", colorCircleScale( _dataDict[currentOblast] ) )
				d3.select(currentTxtID)
					.text( formatPrc(_dataDict[currentOblast]/100) );

	    	})
		};


		function animate(){

		  interval = setInterval( function(){
		  	if(isSliding){isSliding = false;}

		    currentYear++;
		    
		    d3.select("#slider-div .d3-slider-handle")
		      .style("left", 100*currentYear/lastYear + "%" );
		    slider.value(currentYear);
		    updateYear(currentYear);
		    if(currentYear==lastYear){
		      isPlaying = false;
		      d3.select("#play").classed("pause",false).attr("title","Play animation");
		      clearInterval(interval);
		      return;
		    }

		  },1000);
		}

		function createSlider(){
		  sliderScale = d3.scale.linear().domain([initialYear,lastYear]);

		  var val = slider ? slider.value() : initialYear;

		  slider = d3.slider()
		  	.axis(
					d3.svg.axis()
						.ticks(lastYear-initialYear+1)
						.tickFormat(function(d){ return formatYear(d); })
				)
				.min(initialYear)
				.max(lastYear)
				.step(1)
	    	.on("slide",function(event,value){
	    		if(isPlaying){clearInterval(interval);}
		      isSliding = true;
		      currentYear = value;
		      updateYear(currentYear);

		    })
		    .on("slideend",function(value){
		      if ( isPlaying ) animate();
		    })
		    .value(val);

		  d3.select("#slider-div").remove();

		  var aWidth = d3.select("#animation-container").node().getBoundingClientRect().width
		  var pWidth = d3.select("#play").node().getBoundingClientRect().width

		  d3.select("#slider-container")
		    .append("div")
		    .attr("id","slider-div")
		    .style("width", aWidth - pWidth - 50 + 'px')
		    .call( slider );

		  // small mobile rotate axis text
		  if(smallMobile){
		  	d3.selectAll(".d3-slider-axis text")
		 			.attr("transform", function(d) {
             return "translate(" + -this.getBBox().height + "," + this.getBBox().height*1.5 + ")rotate(-90)";
      		});
		  }
		 

		}

		function updateYear(y){
			updateMapTitle(y, recodeBG['crimes-inv'][targetVar])
			updateColorCodeAndDictionary(y, targetVar);
		  updateFirstTitle(y);
		  dispatch.yearChange(situationByYear.get(y), revealedByYear.get(y));
				
			if( d3.select("#barChartOccuredSort").property("checked") ){
				dispatch.sortBarChartO(true);
			}

			if( d3.select("#barChartRevealedSort").property("checked") ){
				dispatch.sortBarChartR(true);
			}
		}


	};


}());
