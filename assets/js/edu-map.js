(function(){

  var height = $(window).height()*0.65;
  var isLargeScreen=true;

  // handle different screen sizes
  if($(window).width()>=980){
    var width = 900;
    $('#mapNav .navbar').css('max-width',width);
  }else{
    isLargeScreen=false;

    $("#navLabel").remove();
    $(".vdivider").remove();

    var tmp = $("#navSelector")[0].outerHTML

    $("#mapNav").empty();
    $("#mapNav").append("<ul role='navigation' class='nav navbar-nav'>");
    $("#mapNav .nav").append(tmp);
    $("#mapNav ul").css({"width": "50%"});

    var width = $(window).width()*0.9;
  }

  var centered = void 0;
  var markerSize = 20;
  var startSubject = 'Total'

  var tileColors = ['#FE1E13','#C04523','#DFBE10','#91BB11'];

  var tileColorStops = [2,3,4,5];

  var isDragging = false;
  var wasDragging = false;

  var progressBarInitiated = false;
  var currentSchoolIDs = [];
  var geojsonFeaturesList = [];

  var changedLocations = {};
  var toMail = 'opendata@government.bg';
  var ccMail = null;
  var subjectMail = 'SchoolMapLocationChanges';
  var bodyMail = 'Здравейте,\r\n\r\nсмятам че трябва да бъдат направени следните промени по местоположението на показаните училища.\r\n Моля, вижте приложения по-долу документ.\r\n\r\nПоздрави,\r\n\r\n';

  // set container size based on screen sizes
  $("#mapLeaf").width(width).height(height);
  $('.leaflet-control-container').width(width/5).height(height/5);
  $("#mapNav .navbar").css({'margin-bottom': 0});
  
  // Queue all data files, currently all in json format
  // TO DO change to csv to improve load times
  queue()
    .defer(d3.json,'../assets/topojson/bg-simple.json')
    .defer(d3.json,'../assets/data/edu-map/school-profile.json')
    .defer(d3.json,'../assets/data/edu-map/school-data.json')
    .defer(d3.json,'../assets/data/edu-map/recoded-en-bg.json')
    .defer(d3.json,'../assets/data/edu-map/recoded-bg-en.json')
    .await(ready);

  // Standard school icon
  var schoolIcon = L.Icon.extend({
          options: {
              iconUrl: '../assets/img/pin-yellow-2.png',
              iconSize:     [40, 40],
              popupAnchor:  [0, 0] 
          }
      });

  // Coloring
  var colorScale = d3.scale.linear()
      .domain(tileColorStops)
      .range(tileColors)

  // MAP settings      
  // map bounds
  // var northWest = L.latLng(44.531314, 21.992676),
  var northWest = L.latLng(44.904889, 20.201375),
      southEast = L.latLng(40.717647, 29.749023),
    bounds = L.latLngBounds(southEast, northWest);

  // map centering
  var mapLeaf = new L.Map("mapLeaf", {center: [42.654, 25.002], zoom: 7, zoomControl: false,
   maxBounds: bounds, 
    maxZoom: 19, minZoom: 7})
    .addLayer(new L.TileLayer("http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {attribution:'Map data © <a href="http://openstreetmap.org">OpenStreetMap</a> contributors'}));

  // D3 overlay with colored tiles of all municipalities
  var svgLeaf = d3.select(mapLeaf.getPanes().overlayPane).append("svg"),
    gLeaf = svgLeaf.append("g").attr("class", "leaflet-zoom-hide");

  var gLayer = L.geoJson().addTo(mapLeaf);

  // D3 projection of points
  function projectPoint(x, y) {
    var point = mapLeaf.latLngToLayerPoint(new L.LatLng(y, x));
    this.stream.point(point.x, point.y);
  }

  // D3 if drop-down is opened remove progressBar svg in order to freely select drop-down menu
  d3.select("#dLabel").on('click',function(){
    d3.select(".sideCharts svg").remove();  
    progressBarInitiated = false;
  });

  // MAP - 4 charts / legents / labels / controls in each corner of the map
  if(isLargeScreen){
    // TOPLEFT
    // ProgressBar - how many schools selected out of all
    var progressBar = L.control({position: 'topleft'});

      progressBar.onAdd = function (map) {
        progressBarInitiated = true;
        this._div = L.DomUtil.create('div', 'sideCharts');

	    $(this._div).append($('<div>').attr('class','progressName'));
	    $(this._div).append($('<div>').attr('class','progressChart'));
	    $(this._div).append($('<div>').attr('class','sliceName'));
	    $(this._div).append($('<div>').attr('class','sliceChart'));

        return this._div;
      };

      progressBar.update = function (progressData, sliceData) {
        if (typeof(progressData)==='undefined' || progressData[1] === 0){
          $('.sideCharts').fadeOut('slow');         
        }else{
          if(($('.sideCharts').length)){
            $('.sideCharts').fadeIn('slow');
          }
          
          $('.progressName').html('<p> Избрани училища брой</p>');
          
          d3.select(".progressChart")
            .datum(progressData)
          .call(progressChart()
            .margin({top: 0, right: 0, bottom: 0, left: 0})
            .width(width/5)
            .height(20)
          );

          $('.sliceName').html('<p> Избрани училища тип</p>');

          d3.select(".sliceChart")
            .datum(sliceData)
          .call(pieChart()
            .margin({top: 0, right: 0, bottom: 0, left: 0})
            .width(width/5)
            .height(width/5)
            .radius(width/10)
            .color(d3.scale.ordinal()
                      .domain(["Държавно", "Общинско", "Частно"])
                      .range(["#3182bd", "#9ecae1", "#c6dbef"]))
          );
        }
      };

    progressBar.addTo(mapLeaf);

    // BOTTOMLEFT
    // Histogram - Total score distibution of all selected schools
    var hist = L.control({position: 'bottomleft'});

      hist.onAdd = function (map) {
        this._div = L.DomUtil.create('div', 'histChart');
        return this._div;
      };

      hist.update = function (data) {
        if (typeof(data)==='undefined'){
          $('.histChart').fadeOut('slow');
        }else{
          $('.histChart').fadeIn('slow');
          this._div.innerHTML = '<p>Хистограма избрани училища</p>';
          d3.select(".histChart")
            .datum(data)
          .call(histogramChart()
            .margin({top: 0, right: 0, bottom: 20, left: 0})
            .width(width/5)
            .height(height/5)
            .range([2,6])
            .bins(Array.apply(0, Array(9)).map(function(_,b) { return 2 + b * 0.5; })) // 2-6 range split in 9 bins
            .tickFormat(d3.format(".02f"))
          );
        }
      };

    hist.addTo(mapLeaf);

    // BOTTOMRIGHT
    // Legend - Municipality tiles coloring
    var legend = L.control({position: 'bottomright'});

    legend.onAdd = function (map) {

        var div = L.DomUtil.create('div', 'info legend'),
          grades = tileColorStops,
          scale = tileColors,
          labels = [],
          from, to;

        for (var i = 0; i < grades.length; i++) {
          from = grades[i];
          to = grades[i + 1];

          labels.push(
            '<i style="background:' + scale[i] + '"></i> ' +
            from + (to ? '&ndash;' + to : '+'));
        }

        div.innerHTML = '<h6> Оцветяване на общините <br> според ср. успех </h6><p>' + labels.join('<p>');
        return div;
      };

    legend.addTo(mapLeaf);

  };


  // TOPRIGHT
  // Label - On hover shows municipality name and average score
  // Add regardless of screen size
  var info = L.control({position: 'topright'});

    info.onAdd = function (map) {
      this._div = L.DomUtil.create('div', 'info');
      this.update();
      return this._div;
    };

    info.update = function (d, schlP, schlD, rBG, rEN) {
      var subject = $('#subjectLabel').text();
      if(d){
        var obsh = rBG['obshtini'][d.properties.obshtina]
        var subj = rEN['subjects'][subject]
        var avr = avrGroupedResults(queryGroupedVals(schlP,schlD,"Obshtina","ID",subj),obsh).toFixed(2)
      }
      this._div.innerHTML = ((obsh!=undefined & (avr>0)) ?
        '<h4>' + obsh + '</h4><br><b> Ср. успех (' + subject + '): ' + avr + '</b>'
        : 'Посочете община');
    };

  info.addTo(mapLeaf);


  // MARKER TIP
  // set-up the tip itself

  function initSchoolTip(feature, layer) {
      var card = "<div id='schoolInfo'><strong>Училище: </strong>" + feature.properties.SchoolName + "<br>"
          + "<strong>Тип: </strong>" + feature.properties.SchoolAdmin + "<br>"
          + "<strong>Вид: </strong>" + feature.properties.SchoolType + "<br>"
          + "<strong>Адрес: </strong>" + feature.properties.Address + "<br>"
          + "<strong>Община: </strong>" + feature.properties.Obshtina + "<br>"
          + "<strong>Област: </strong>" + feature.properties.Oblast + "<br>"  
          + "</div>";
      var ranked = "<div id='schoolRank'></div>"
      var tbl = "<table id='schoolTbl' class='display' cellspacing='0' width='80%'>";
      
      var res = card + ranked + tbl;
      var customOptions = {'maxWidth': '400px',  'maxHeight:': '300px', 'autoPan' : false, 'zoomAnimation' : false }
      layer.bindPopup(res, customOptions);
  }

  // call additional function to write the data table each time a popup is opened

  function initSchoolDT(d,r,obshtinaBG,oblastBG,schoolProfiles,schoolScores){

    // Filter only subject were test scores are available
    validData = []
    validData = $.grep(Object.keys(d), function(k){ return (d[k][0] != null); });

    var schoolTableHandle = d3.select('#schoolTbl');
    
    var thead = schoolTableHandle.append("thead")
    
    thead.append("tr")
        .selectAll("th")
        .data(["Предмет","Ср.успех","Бр","Ср.успех община","Ср.успех област"])
        // .data(["Предмет","Ср.успех","Бр","Ср.успех община","Ср.успех област","Ср.успех"])
        .enter()
        .append("th")
            .text(function(c) { return c; });

    var tbody = schoolTableHandle.append("tbody")

    var tr = tbody.selectAll('tr')
        .data(validData)
        .enter()
        .append('tr');

    // Initialize containers to store average scores per obshtina and oblast
    // Scores will be computed only once for the first time 
    var averageResultsObshtina = []
    var averageResultsOblast = []

    tr.append('td').html(function(m) { return r[m]; });
    tr.append('td').html(function(m,i) { 
      res = '';

      var currentScore = d[m][0]
      
      var queryCountry = $.map(schoolScores, function(n, i){ return n['Scores'][m][0]; });
      var topQuartileResultCountry = getPerc(0.75, queryCountry);
      var bottomQuartileResultCountry = getPerc(0.25, queryCountry);

      var queryObshtina = queryGroupedVals(schoolProfiles,schoolScores,"Obshtina","ID",m);
      var currentAverageResultObshtina = avrGroupedResults(queryObshtina,obshtinaBG);
      averageResultsObshtina.push(currentAverageResultObshtina);

      var queryOblast = queryGroupedVals(schoolProfiles,schoolScores,"Oblast","ID",m);
      var currentAverageResultOblast = avrGroupedResults(queryOblast,oblastBG);
      averageResultsOblast.push(currentAverageResultOblast);

      if ((currentScore >= currentAverageResultObshtina)
       && (currentScore >= currentAverageResultOblast)
       && (currentScore >= topQuartileResultCountry)) {
        res = '<img src="../assets/img/marker-star-1.png">' + currentScore;

      } else if ((currentScore < currentAverageResultObshtina) 
        && (currentScore < currentAverageResultOblast)
        && (currentScore < bottomQuartileResultCountry)) {

        res = '<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAATCAMAAAHQVe0RAAAAclBMVEWTyZP/tbXExP/f3/9ERP+Bgf/S0v/09P9ZWf/7+///k5P/RERubv/0+vT/+/ulpf//9PT/paUYGP//AAD/Li6BwIH/0tL/39/q6v//xMSTk/////8YjBguLv+1tf/q9er/bm4AgAD/GBj/gYH/6uoAAP80qE9XAAAAAXRSTlMAQObYZgAAAAlwSFlzAAAuIwAALiMBeKU/dgAAAAd0SU1FB98MBhENIrINQGkAAABDSURBVBjTlY9RCgAwCEK9w7v/XUeDWEVB88fQ0JIMyAGRqQaXCHoCuMUbxbjfJ9SsGFZH/VeMjekLsg6NuhfbzNXhB/bvCTXbbIjfAAAAAElFTkSuQmCC">' + currentScore;

      }else{

        res = currentScore;

      }

      return res});
    tr.append('td').html(function(m) { return d[m][1]; });
    tr.append('td').html(function(m,i) { return averageResultsObshtina[i].toFixed(2); });
    tr.append('td').html(function(m,i) { return averageResultsOblast[i].toFixed(2); });

    $(document).ready(function() {
        $('#schoolTbl').DataTable({
          "scrollY": '200px',
          "paging":   false,
          "searching": false,
          "info":     false,
          "order": []
        });
    });

    var currentObshList, currentOblList, posObsh, posObl;

    currentObshList = queryGroupedVals(schoolProfiles,schoolScores,"Obshtina","ID","Total")[obshtinaBG]
                      .sort(function(a, b){return b-a});
    currentOblList = queryGroupedVals(schoolProfiles,schoolScores,"Oblast","ID","Total")[oblastBG]
                    .sort(function(a, b){return b-a});

    posObsh = $.inArray(d['Total'][0],currentObshList) + 1
    posObl = $.inArray(d['Total'][0],currentOblList) + 1

    $('#schoolRank').html('На ' + posObsh + ' място от ' + currentObshList.length + ' в Община ' + obshtinaBG +  ' и на ' + posObl + ' място от ' + currentOblList.length + ' в Област ' + oblastBG);

  };


  function convertDataToGeoJson(s){
        v = {
            "type": "Feature",
            "properties": {
              "ID":s.ID,
              "SchoolName":s.SchoolName,
              "Oblast": s.Oblast,
              "Obshtina": s.Obshtina,
              "NaselenoMqsto": s.NaselenoMqsto,
              "SchoolAdmin": s.SchoolAdmin,
              "SchoolType": s.SchoolType,
              "Address": s.Address
            },
            "geometry": {
                "type": "Point",
                "coordinates": [s.Longitude,s.Latitude]
            }
        };
        return v
  }


  function filterByCriteria (obj,field, criteria){
    var found_names = $.grep(obj, function(v) {
        return ($.inArray(v[field],criteria)>-1);
    });
    return found_names
  };
  
  function filterByCriteriaSelectField (items,field, criteria, selectField, selectFieldLevel2, position){
    // First checks if the item satisfies the criteria
    // Second if only one field it give in the argument list returns it
    // The final step assumes the innate structure of the school-data.json file
    // Third if a second field is also provided goes one more level down the tree an returns item at the selected position

    return $.map(items, function(item){ 
      if ($.inArray(item[field], criteria) == -1){
        return null;
      }else if (typeof(selectFieldLevel2)==='undefined' || typeof(position)==='undefined'){
        return item[selectField];
      }else{
        return item[selectField][selectFieldLevel2][position];
      }
      })
  };

  function getField(obj, field){
    return $.map(obj, function(n, i){ return n[field]; });
  };

  function queryGroupedVals(items1,items2,groupingField,foreignkeyField,extractField,fieldsContainer){
    if (typeof(fieldsContainer)==='undefined') fieldsContainer = 'Scores';
    var groupedObj = void 0;

    var groupedObj = d3.nest()
      .key(function(d) { return d[groupingField]; })
      .entries(items1);
    
    var valsByGroup = {};

    groupedObj.forEach(function(el){
      var schoolIDList = getField(el.values,foreignkeyField);
      var schoolScores = filterByCriteriaSelectField(items2,foreignkeyField,schoolIDList,fieldsContainer,extractField,0);
      valsByGroup[el.key]= schoolScores
    });

    return valsByGroup;
  };

  function avrGroupedResults(obj, group){
    var sum=0, avg=0, arr=[];

    if(group){

      if ( $.inArray(group,Object.keys(obj)) > -1 ) {
        arr = obj[group].filter(Number);
      }

    }else{ 

      if(obj.length > 0){ arr = obj.filter(Number); }

    }

    if(arr.length > 0){
      sum = arr.reduce(function(a, b) { return a + b; });
      avg = sum / arr.length;  
    }

    return avg;
  };


  // Get percentile
  // Expects: perc : 0 to 1; arr : an array with numbers

  function getPerc(perc, arr) {
    var ind, res;

    // filter out null elements
    arr = arr.filter(Number)

    arr.sort(function(a, b){return a-b});
    ind = perc * arr.length;
    if (Math.floor(ind) == ind) {
      res = (arr[ind-1] + arr[ind])/2;
    }
    else {
      res = arr[Math.floor(ind)-1];
    }
    return res;
  };


  function ready(error, mapJson, schoolProfile, schoolData, recodeBG, recodeEN) {

    if (error){ throw error};
    
    var regions = topojson.feature(mapJson, mapJson.objects.regions);

    var baseQuery = queryGroupedVals(schoolProfile,schoolData,"Obshtina","ID",startSubject);

  	var transformLeaf = d3.geo.transform({point: projectPoint}),
  	  	pathLeaf = d3.geo.path().projection(transformLeaf);

  	var featureLeaf = gLeaf.selectAll("path")
  		  .data(regions.features)
  		.enter().append("path")
        .style('fill',function(d){ 
          var obshtinaBG = recodeBG['obshtini'][d.properties.obshtina];
          var avr = avrGroupedResults(baseQuery,obshtinaBG)
          return obshtinaBG != undefined ? colorScale(avr) : '#cccccc'; })
        // Test for dragging
        .on('mousedown',function() {
            isDragging = false;
            wasDragging = false;
        })
        .on('mousemove',function() {
            isDragging = true;
         })
        .on('mouseup',function() {
            wasDragging = isDragging;
            isDragging = false;
         })
        // add hover effects
        .on('mouseover', function (d) {
          info.update(d, schoolProfile, schoolData, recodeBG, recodeEN)
        })
        .on('mouseout', function (d) {info.update()})
        .on('click', function (d) {
          if (recodeBG['obshtini'][d.properties.obshtina] != undefined) {
            clicked(d); 
        }});

    	mapLeaf
        .on("viewreset", reset)
        .on('zoomend', function () {
          if (mapLeaf.getZoom() > 9) {
              featureLeaf.style('opacity',0);
              $('.info').fadeOut('slow');
          }
          if (mapLeaf.getZoom() < 9 )
          {
              featureLeaf.style('opacity',1);
              $('.info').fadeIn('slow');
          }
        });

    	reset();

  	  function reset() {
  	    var bounds = pathLeaf.bounds(regions),
  	        topLeft = bounds[0],
  	        bottomRight = bounds[1];

  	    svgLeaf.attr("width", bottomRight[0] - topLeft[0])
  	        .attr("height", bottomRight[1] - topLeft[1])
  	        .style("left", topLeft[0] + "px")
  	        .style("top", topLeft[1] + "px");

  	    gLeaf.attr("transform", "translate(" + -topLeft[0] + "," + -topLeft[1] + ")");

  	    featureLeaf.attr("d", pathLeaf);
  	  };

      // Add option menu with
      var select  = d3.select(".dropdown-menu").selectAll('li')
        .data(Object.keys(recodeEN['subjects']))

      // Enter selection
      select.enter()
        .append('li').append('a')
        .text(function(d) { return d; })
        .on('click', function(sub) {
          
          var baseQuery = queryGroupedVals(schoolProfile,schoolData,"Obshtina","ID",recodeEN['subjects'][sub]);

          d3.select('#subjectLabel')
            .text(sub)
            .append('span')
            .attr('class',"caret");

          d3.selectAll('path').transition()
            .duration(1000)
            .style('fill', function(d) {
              if(d){
                var obshtinaBG = recodeBG['obshtini'][d.properties.obshtina];
                var avr = avrGroupedResults(baseQuery,obshtinaBG);
                return avr > 0 ? colorScale(avr) : '#cccccc'
              }
              return  '#cccccc';
          });

          if(($('.progressBar svg').length || progressBarInitiated ) && isLargeScreen){
            progressBar.update([schoolData.length,currentSchoolIDs.length]);  
          }
        });

      function clicked(d) {

        if (wasDragging) return;
        if (d3.event.defaultPrevented) return;
        d3.event.stopPropagation();
        
        mapLeaf.removeLayer(gLayer);

        var currentObshtinaBG = recodeBG['obshtini'][d.properties.obshtina];

        if (d && centered !== d) {

          centered = d;

          newSchoolIDs = filterByCriteriaSelectField(schoolProfile,'Obshtina',[currentObshtinaBG],'ID');

          currentSchoolIDs = currentSchoolIDs.concat(newSchoolIDs);

          var currentSchoolScores = filterByCriteriaSelectField(schoolData,'ID',currentSchoolIDs,'Scores','Total',0)

          threshold = getPerc(0.9,currentSchoolScores);

          var newSchools = filterByCriteria(schoolProfile,'ID',newSchoolIDs)
          var newgeoFeatures = $.map(newSchools, function(item){ return convertDataToGeoJson(item); })
          geojsonFeaturesList = geojsonFeaturesList.concat(newgeoFeatures);

          gLayer = L.geoJson(geojsonFeaturesList,{
              
              pointToLayer: function(feature, latlng) {

                  var currentScore = filterByCriteriaSelectField(schoolData,'ID',[feature.properties.ID],'Scores','Total',0)

                  var sIcon = void 0;
                  if(currentScore >= threshold){
                    sIcon = new schoolIcon({iconUrl: '../assets/img/pin-blue-2.png'});
                  }else{
                    sIcon = new schoolIcon();
                  }
      
                  return L.marker(latlng, {icon: sIcon, draggable: true})
                          .on('dragend', function(event){
                            var currentChange = {}
                            currentChange[String(event.target.feature.properties.ID)] = event.target.getLatLng()
                            $.extend(changedLocations, currentChange);
                            $('#locationChanges').width(0.9 * width);
                            $('#locationChanges').html(JSON.stringify(changedLocations, undefined, 2))
                          })
              },

              onEachFeature: initSchoolTip,

          }).addTo(mapLeaf);

          mapLeaf
          .on('popupopen', function(e) {

            var feature = e.popup._source.feature;
            var correctionTerm = 0.1;
            
            mapLeaf.setView(
              new L.LatLng(
                feature.geometry.coordinates[1] + correctionTerm, 
                feature.geometry.coordinates[0]),
                11,
                {'animate': true}
            );

            if (!$('#schoolRank').html().length) {
              var schoolInfo = filterByCriteriaSelectField(schoolData,'ID',[feature.properties.ID],'Scores')[0]
              var histHandle = d3.select('.histChart svg');

              histHandle.selectAll('line').remove();

              initSchoolDT(
                schoolInfo,
                recodeBG.subjects,
                feature.properties.Obshtina,
                feature.properties.Oblast,
                schoolProfile,
                schoolData);

              var histData = histHandle.data()[0]

              var x2 = d3.scale.linear()
                .domain([2, 6])
                .range([0 , (width/5)]);

              var schoolTotalScore = schoolInfo.Total[0];

              histHandle.append("line")
                       .attr("x1", x2(schoolTotalScore))
                       .attr("y1", 10)
                       .attr("x2", x2(schoolTotalScore))
                       .attr("y2", height/5)
                       .attr("stroke-width", 2)
                       .attr("stroke", "black");
            }
            

          })
          .on('popupclose', function(e) {
              var histHandle = d3.select('.histChart svg');
              histHandle.selectAll('line').remove();
          }); 


        } else {

          centered = null;
          currentSchoolIDs = []
          geojsonFeaturesList = []

        }

        if(isLargeScreen){
          hist.update(currentSchoolScores);
          var currentSchoolAdmins = filterByCriteriaSelectField(schoolProfile,'ID',currentSchoolIDs,'SchoolAdmin')
          progressBar.update([schoolData.length,currentSchoolIDs.length],currentSchoolAdmins);
        }

      };

  };

  // ADDs mailing functionality last but not least

  $('#locationMail').click(function(){
      if(!$.isEmptyObject(changedLocations)){
        var link = "mailto:" + toMail
               + (ccMail ? ("?cc=" + ccMail+'&')  : "?")
               + "subject=" + escape(subjectMail + new Date().toJSON().slice(0,10))
               + "&body=" + encodeURIComponent(bodyMail)
               + escape(JSON.stringify(changedLocations, undefined, 2));

        window.location.href = link; 
      }
      return false
  });

})();
