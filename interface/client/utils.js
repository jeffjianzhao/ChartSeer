/*************************************************************************
 * Copyright (c) 2018 Jian Zhao
 *
 *************************************************************************
 *
 * @author
 * Jian Zhao <zhao@fxpal.com>
 *
 *************************************************************************/

 // external libs'
import vegaEmbed from 'vega-embed'
import SumView from './sumview.js'
import ChartView from './chartview.js'

var logging = false

export var vegaConfig = {
    axis: {labelFontSize:9, titleFontSize:9, labelAngle:-45, labelLimit:50},
    legend: {gradientLength:20, labelFontSize:6, titleFontSize:6, clipHeight:20}
}

export function createDataTable(scrollH) {
    var columns = _.keys(app.data.chartdata.values[0]).map((d) => {return {title: d} })
    var tabledata = app.data.chartdata.values.map((d) => {
        var record = []
        for(var i = 0; i < columns.length; i++)
            record.push(d[columns[i].title])
        return record
    })

    if(app.datatable) {
        app.datatable.destroy()
        $('#dataview table').empty()
    }
    app.datatable = $('#dataview table').DataTable({
        columnDefs: [
            {
                targets: '_all', 
                render: function(data, type, row, meta) {
                    return '<span style="color:' 
                        + app.sumview._varclr(columns[meta.col].title) + '">' + data + '</span>'
                }
            }
        ],
        data: tabledata,
        columns: columns,
        scrollY: scrollH,
        scrollX: true,
        paging: false,
        scrollCollapse: true,
        searching: false,
        info: false
    })  

    columns.forEach((c) => {
        $('#legend').append('/<span class="legend-item" style="color:' + app.sumview._varclr(c.title) + '">' + c.title + '</span>')
    })
}

export function displayAllCharts(container, created) {
    $(container).empty()
    app.sumview.charts.forEach((ch) => {
        if(ch.created == created) {
            var vegachart = _.extend({}, ch.originalspec, 
                { width: 270, height: 125, autosize: 'fit' }, 
                { data: {values: app.data.chartdata.values} },
                { config: vegaConfig})
            $(container).append($('<div />', {class: 'chartdiv', id: 'chart' + ch.chid}))
            $('#chart' + ch.chid).append('<div class="chartcontainer"></div><span class="chartlabel"></span>')

            vegaEmbed('#chart' + ch.chid + ' .chartcontainer', vegachart, {actions: false})
            $('#chart' + ch.chid + ' .chartlabel').css('background-color', ch.created ? '#f1a340' : '#998ec3')
            $('#chart' + ch.chid + ' .chartlabel').html('#' + ch.chid + '-u' + ch.uid)
            
            $('#chart' + ch.chid).hover((e) => {
                $('#chart' + ch.chid).css('border-color', 'crimson')
                app.sumview.highlight(ch.chid, true)
            }, (e) => {
                $('#chart' + ch.chid).css('border-color', 'lightgray')
                app.sumview.highlight(ch.chid, false)
            }).click((e) => {
                app.sumview.selectedChartID = ch.chid
            })
        }
    })
}

export function handleEvents() {
    app.sumview.on('clickchart', (ch) => {
        app.chartview.update(ch.originalspec, 'outside')

        $('#chartview .chartlabel').css('background-color', ch.created ? '#f1a340' : '#998ec3')
        $('#chartview .chartlabel').html('#' + ch.chid + '-u' + ch.uid)
        if(ch.created) {
            $('#update, #remove').attr('disabled', true)
        }
        else {
            $('#update, #remove').attr('disabled', false)
        }
        
        if(logging) app.logger.push({time:Date.now(), action:'clickchart', data:ch.originalspec})
    })
    .on('mouseoverchart', (ch) => {
        var vegachart = _.extend({}, ch.originalspec, 
            { width: 390, height: 190, autosize: 'fit' }, 
            { data: {values: app.data.chartdata.values} },
            { config: vegaConfig})
        vegaEmbed('#tooltip .chartcontainer', vegachart, {actions: false})
        
        $('#tooltip .chartlabel').css('background-color', ch.created ? '#f1a340' : '#998ec3')
        $('#tooltip .chartlabel').html('#' + ch.chid + '-u' + ch.uid)
    })
    .on('recommendchart', () => {
        displayAllCharts('#suggestionview', true)
        if(logging) app.logger.push({time:Date.now(), action:'recommendchart'})

    })

    app.chartview.on('add-chart', (spec) => {
        if(app.sumview.data.chartspecs.length > 0)
            spec._meta = {chid: app.sumview.data.chartspecs[app.sumview.data.chartspecs.length - 1]._meta.chid + 1, uid: 0}
        else
            spec._meta = {chid:0, uid:0}
        app.sumview.data.chartspecs.push(spec)

        app.sumview.update(() => {app.sumview.selectedChartID = spec._meta.chid })
        
        displayAllCharts('#allchartsview', false)
        $('#suggestionview').empty() 
        
        if(logging) app.logger.push({time:Date.now(), action:'addchart', data:spec})
    })

    app.chartview.on('update-chart', (spec) => {
        spec._meta = app.sumview.data.chartspecs[app.sumview.selectedChartID]._meta
        app.sumview.data.chartspecs[app.sumview.selectedChartID] = spec

        app.sumview.update(() => {app.sumview.selectedChartID = spec._meta.chid })
        displayAllCharts('#allchartsview', false)
        $('#suggestionview').empty()  

        if(logging) app.logger.push({time:Date.now(), action:'updatechart', data:spec})
    })

    app.chartview.on('remove-chart', (spec) => {
        app.sumview.data.chartspecs = app.sumview.data.chartspecs.filter((d) => { return d._meta.chid != app.sumview.selectedChartID })
        app.sumview.update()
        displayAllCharts('#allchartsview', false)
        $('#suggestionview').empty() 

        if(logging) app.logger.push({time:Date.now(), action:'removechart', data:spec})
    })

    $('#import').click(() => {
        $('#dialog').css('display', 'block')
    })

    $('.close').click(() => {
        $('#dialog').css('display', 'none')
    })

    $('#submit').click(() => {
        if($('#inputfile').val()) {
            var reader = new FileReader();
            reader.onload = function(e) {
                var d = JSON.parse(reader.result);
                updateData(d, $('#inputfile').val())
            };

            reader.readAsText(document.getElementById('inputfile').files[0]);
        }
        else if($('#inputurl').val()) {
            $.get($('#inputurl').val()).done((d) => {
                updateData(d, $('#inputurl').val())
            })
        }

        $('.close').click()
    })

    $('#export').click(() => {
        download(JSON.stringify({
                charts: app.sumview.data.chartspecs,
                attributes: app.sumview.data.chartdata.attributes,
                data: app.sumview.data.chartdata.values 
            }, null, '  '), 'datacharts.json', 'text/json')
        if(logging) download(JSON.stringify(app.logger, null, '  '), 'logs.json', 'text/json')
    })

    $('#weight_slider').change(() => {
        var w = $('#weight_slider').val() / 100.0
        $('#weight').html( w.toFixed(2) )
        app.sumview.weight = w
    })

    $('#show_bubble').change(() => {
        var showbubbles = $('#show_bubble').is(':checked')
        app.sumview.showBubbles = showbubbles
    })

    $(window).resize(() => {
        app.sumview.svgsize = [$('#sumview').width(), $('#sumview').height()]
    })
}

export function parseurl() {
    var parameters = {}
    var urlquery = location.search.substring(1)
	if(urlquery) {
		urlquery.split("&").forEach(function(part) {
			var item = part.split("=")
    		parameters[item[0]] = decodeURIComponent(item[1])
    		if(parameters[item[0]].indexOf(",") != -1)
                parameters[item[0]] = parameters[item[0]].split(",")
		})
	}

    return parameters
}

export function updateData(data, name) {
    $("#datafile").html(name)

    app.data = {}
    app.data.chartdata = {attributes: data.attributes, values: data.data}
    app.data.chartspecs = data.charts

    app.sumview = new SumView(d3.select('#sumview'), app.data, {
        backend: 'http://localhost:5000',
        size: [$('#sumview').width(), $('#sumview').height()],
        margin: 10,
        chartclr: ['#f1a340', '#998ec3']
    })
    app.sumview.update()

    app.chartview = new ChartView({}, {
        attributes: app.data.chartdata.attributes,
        datavalues: app.data.chartdata.values,
        vegaconfig: vegaConfig
    })

    createDataTable(280)
    displayAllCharts('#allchartsview', false)
    displayAllCharts('#suggestionview', true)

    // events handling
    handleEvents()
}

function download(content, fileName, contentType) {
    var a = document.createElement("a");
    var file = new Blob([content], {type: contentType});
    a.href = URL.createObjectURL(file);
    a.download = fileName;
    a.click();
}

export default {vegaConfig, handleEvents, parseurl, createDataTable, displayAllCharts, updateData}