/*************************************************************************
 * Copyright (c) 2018 Jian Zhao
 *
 *************************************************************************
 *
 * @author
 * Jian Zhao <zhao@fxpal.com>
 *
 *************************************************************************/

import EventEmitter from "events"
import vegaEmbed from 'vega-embed'
import * as cql from 'compassql'
import {SpecQueryModel} from 'compassql/build/src/model'
import {rank} from 'compassql/build/src/ranking/ranking'

import clusterfck from '../components/clusterfck/lib/clusterfck'
import {BubbleSet, PointPath, BSplineShapeGenerator, ShapeSimplifier} from '../components/bubblesets-js/bubblesets'

export default class SumView extends EventEmitter {
    constructor(container, data, conf) {
        super()

        this.container = container
        this.data = data
        this.conf = conf

        this._params = {
            recradius: 0.1,
            recnum: 5,
            dotr: 11,
            distw: 0.5,
            clthreshold: 0.4,
            ngbrN: 5
        }
        this._charts = [] //所有的图表数组
        this._prevcharts = []
        this._clusterNum = 1
        this._bubbleSets = []
        this._variableSets = []
        this._showBubbles = true
        this._selectedChartID = -1
        //this._rscale = d3.scaleLinear().domain([0, 4]).range([0, this._params.dotr])
        this._xscale = d3.scaleLinear().domain([0, 1])
            .range([this.conf.margin, this.conf.size[0] - this.conf.margin])
        this._yscale = d3.scaleLinear().domain([0, 1])
            .range([this.conf.margin, this.conf.size[1] - this.conf.margin])
        this._pie = d3.pie().sort(null).value(d => d.value)
        this._arc = d3.arc().innerRadius(this._params.dotr - 5).outerRadius(this._params.dotr)
        //this._varclr = d3.scaleOrdinal(['#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4', '#46f0f0', '#f032e6', '#bcf60c', '#fabebe', '#008080', '#e6beff', '#9a6324', '#fffac8', '#800000', '#aaffc3', '#808000', '#ffd8b1', '#000075'])
        this._varclr = d3.scaleOrdinal(['#F3C300', '#875692', '#F38400', '#A1CAF1', '#BE0032', '#C2B280', '#848482', '#008856', '#E68FAC', '#0067A5', '#F99379', '#604E97', '#F6A600', '#B3446C', '#DCD300', '#882D17', '#8DB600', '#654522', '#E25822', '#2B3D26'])
        this._usrclr = d3.scaleOrdinal(d3.schemeGreys[5]).domain([0, 1, 2, 3, 4])

        this._init()
    }

    get charts() {
        return this._charts
    }
    
    get selectedChartID() {
        return this._selectedChartID
    }

    set selectedChartID(ch) {
        this._svgDrawing.selectAll('.chartdot.selected')
            .classed('selected', false) 
        if(ch < 0) {
            this._selectedChartID = -1
        }
        else {
            this._selectedChartID = ch
            this._svgDrawing.selectAll('.chartdot')
                .filter((c) => {return c.chid == ch})
                .classed('selected', true)
            var selectedChart = _.find(this._charts, (d) => {return this._selectedChartID == d.chid}) 
            this.emit('clickchart', selectedChart) 
        }
    }

    set weight(w) {
        this._params.distw = w
        this.update()
    }

    set showBubbles(v) {
        this._showBubbles = v
        if(!v) {
            this._svgDrawing.selectAll('.bubble, .backtext').remove()
        }
        this.render()
    }

    set svgsize(size) {
        this.conf.size = size
        this._xscale.range([this.conf.margin, this.conf.size[0] - this.conf.margin])
        this._yscale.range([this.conf.margin, this.conf.size[1] - this.conf.margin])
        this.svg.attr('width', this.conf.size[0])
            .attr('height', this.conf.size[1])
        this.svg.select('.background')
            .attr('width', this.conf.size[0])
            .attr('height', this.conf.size[1])
        this._createBubbles()
        this.render()
    }

    _init() {
        this.container.select('svg').remove()
        this.svg = this.container.append('svg')
            .attr('width', this.conf.size[0])
            .attr('height', this.conf.size[1])
        this._svgDrawing = this.svg.append('g')
            .attr('translate', 'transform(' + this.conf.margin + ',' + this.conf.margin + ')')
        this._svgDrawing.append('g')
            .attr('class', 'bubblelayer')
        this._svgDrawing.append('g')
            .attr('class', 'textlayer')
        this._svgDrawing.append('circle')
            .attr('class', 'cursorc')
            .attr('r', this.conf.size[0] * this._params.recradius)
            .style('visibility', 'hidden')
        this._svgDrawing.append('rect')
            .attr('class', 'background')
            .attr('x', 0)
            .attr('y', 0)
            .attr('width', this.conf.size[0])
            .attr('height', this.conf.size[1])
            .on('click', () => {
                if(!this.conf.norecommend && this._charts.length >= 3) {
                    var p = d3.mouse(this._svgDrawing.node())
                    this._charts = _.filter(this._charts, (c) => {return !c.created})
                    this.render()
                    this._recommendCharts(p)
                }
                else {
                    alert('You need to create at least 3 charts.')
                }
            })
            .on('mouseover', () => {
                this._svgDrawing.select('.cursorc').style('visibility', 'visible')
            })
            .on('mouseout', () => {
                this._svgDrawing.select('.cursorc').style('visibility', 'hidden')
            })
            .on('mousemove', () => {
                var p = d3.mouse(this._svgDrawing.node())
                this._svgDrawing.select('.cursorc').attr('cx', p[0]).attr('cy', p[1])
            })
        this._svgDrawing.append('g')
            .attr('class', 'chartlayer')
    }

    update(callback) {
        this._prevcharts = this._charts

        this.selectedChartID = -1
        this._charts = this.data.chartspecs.map((d, i) => {
            var osp = _.extend({}, d)
            delete osp._meta

            var sp = JSON.stringify(osp)
            var vars = []
            this.data.chartdata.attributes.forEach((attr) => {
                sp = sp.replace(new RegExp(attr[0], 'g'), (m) => {
                    vars.push(m)
                    return attr[1]
                })
            })
            //var varnum = (sp.match(/num|str/g) || []).length
            return {originalspec: osp, normspec: sp, 
                vars: _.union(vars), created: false, chid: d._meta.chid, uid: d._meta.uid}
        })
        
        if(this._charts.length != 0)
            this._computeProjection(false, () => {
                this._computeClusters()
                this._createBubbles()
                this.render()
                if(callback) callback()
            })
    }

    render() {
        if(this._showBubbles) {
            // draw bubbles
            var bubbles =  this._svgDrawing.select('.bubblelayer')
                .selectAll('.bubble')
                .data(this._bubbleSets)

            bubbles.enter()
                .append('path')
                .attr('class', 'bubble')
                .attr('d', (d) => {return d})
                .style('opacity', 0)
                .transition()
                .duration(1000)
                .style('opacity', 1)

            bubbles.style('opacity', 0)
                .attr('d', (d) => {return d})
                .transition()
                .duration(1000)
                .style('opacity', 1)

            bubbles.exit()
                .remove()

            // draw text
            var texts = this._svgDrawing.select('.textlayer')
                .selectAll('.backtext')
                .data(this._variableSets)

            texts.enter()
                .append('text')
                .attr('class', 'backtext')
                .attr('x', (d) => {return this._xscale(d.loc[0]) + _.random(-20, 20) })
                .attr('y', (d) => {return this._yscale(d.loc[1]) + _.random(-20, 20) })
                .style('font-size', (d) => {return 8 + d.count * 2})
                .style('fill', (d) => {return this._varclr(d.text)})
                .text((d) => {return d.text})
                .style('opacity', 0)
                .transition()
                .duration(1000)
                .style('opacity', 1)

            texts.style('opacity', 0)
                .attr('x', (d) => {return this._xscale(d.loc[0]) + _.random(-20, 20) })
                .attr('y', (d) => {return this._yscale(d.loc[1]) + _.random(-20, 20) })
                .style('font-size', (d) => {return 8 + d.count * 2})
                .style('fill', (d) => {return this._varclr(d.text)})
                .text((d) => {return d.text})
                .transition()
                .duration(1000)
                .style('opacity', 1)

            texts.exit().remove()
        }
        // draw charts
        var charts = this._svgDrawing.select('.chartlayer')
            .selectAll('.chartdot')
            .data(this._charts, (d) => { return d.chid })

        // enter
        var chartsenter = charts.enter()
            .append('g')
            .attr('class', 'chartdot')
            .attr('transform', (d) => {
                return 'translate(' + this._xscale(d.coords[0]) + ',' + this._yscale(d.coords[1]) + ')'
            })
            .on('click', (d) => {
                this.selectedChartID = d.chid
                // this._selectedChart = d
                // this._svgDrawing.selectAll('.chartdot.selected')
                //     .classed('selected', false) 
                // this._svgDrawing.selectAll('.chartdot')
                //     .filter((c) => {return c.chid == d.chid})
                //     .classed('selected', true) 
                // this.emit('clickchart', d) 
            })
            .on('mouseover', (d) => {
                this.highlight(d.chid, true)
                this.emit('mouseoverchart', d)
                d3.select('#tooltip')
                    .style('display', 'inline-block')
                    .style('left', (d3.event.pageX + 8) + 'px')
                    .style('top', (d3.event.pageY + 8) + 'px')
            })
            .on('mouseout', (d) => {
                this._svgDrawing.selectAll('.chartdot.hovered').classed('hovered', false) 
                d3.select('#tooltip').style('display', 'none') 
            })

        chartsenter.append('circle')
            .attr('r', this._params.dotr)
            .attr('cx', 0)
            .attr('cy', 0)        

        chartsenter.append('text')
            .attr('class', 'marktext')
            .attr('x', 0)
            .attr('y', 0)
            .text((d) => {return d.originalspec.mark.substring(0,1).toUpperCase()})

        chartsenter.append('rect')
            .attr('x', this._params.dotr - 5)
            .attr('y', this._params.dotr - 5)
            .attr('width', 10)
            .attr('height', 10)
            
        chartsenter.append('text')
            .attr('class', 'uidtext')
            .attr('x', this._params.dotr)
            .attr('y', this._params.dotr)
            .text((d) => { return d.created ? 'x' : d.uid })
        
        var arcs = chartsenter.selectAll('path')
            .data((d) => { return this._pie(d.vars.map((v) => {return {name: v, value: 1.0}})) })
        arcs.enter()
            .append('path')
            .attr('d', this._arc)
            .style('fill', (d) => { return this._varclr(d.data.name) })
        
        chartsenter.style('opacity', 0)
            .transition()
            .duration(500)
            .style('opacity', 1)

        // update
        charts.transition()
            .duration(1000)
            .attr('transform', (d) => {
                return 'translate(' + this._xscale(d.coords[0]) + ',' + this._yscale(d.coords[1]) + ')'
            })

        chartsenter.select('.marktext')
            .text((d) => {return d.originalspec.mark.substring(0,1).toUpperCase()})

        chartsenter.select('.uidtext')
            .text((d) => { return d.created ? 'x' : d.uid })
        
        arcs = charts.selectAll('path')
            .data((d) => { return this._pie(d.vars.map((v) => {return {name: v, value: 1.0}})) })
        arcs.enter()
            .append('path')
            .attr('d', this._arc)
            .style('fill', (d) => { return this._varclr(d.data.name) })
        arcs.attr('d', this._arc)
            .style('fill', (d) => { return this._varclr(d.data.name) })
        arcs.exit().remove()
        
        // exit
        charts.exit()
            .remove()
    }

    highlight(chid, hoverin) {
        this._svgDrawing.selectAll('.chartdot.hovered').classed('hovered', false) 
        if(hoverin) {
            this._svgDrawing.selectAll('.chartdot')
                .filter((c) => {return c.chid == chid})
                .classed('hovered', true)
        }
    }

    _createBubbles() {
        var bubblesets = []
        var variablesets = []

        for(var i = 0; i < this._clusterNum; i++) {
            var thisrects = []
            var otherrects = []
            var thisvars = {}

            this._charts.forEach((ch) => {
                if(ch.clid == i) {
                    thisrects.push({
                        x: this._xscale(ch.coords[0]) - this._params.dotr,
                        y: this._yscale(ch.coords[1]) - this._params.dotr,
                        width: this._params.dotr * 2,
                        height: this._params.dotr * 2  
                    })

                    ch.vars.forEach((v) => {
                        if(v in thisvars) {
                            thisvars[v].count += 1
                            thisvars[v].loc[0] += ch.coords[0] 
                            thisvars[v].loc[1] += ch.coords[1] 
                        }
                        else {
                            thisvars[v] = {count:1, loc:[ch.coords[0], ch.coords[1]]} 
                        }
                    })
                }
                else {
                    otherrects.push({
                        x: this._xscale(ch.coords[0]) - this._params.dotr,
                        y: this._yscale(ch.coords[1]) - this._params.dotr,
                        width: this._params.dotr * 2,
                        height: this._params.dotr * 2  
                    }) 
                }
            })

            var bubbles = new BubbleSet()
            var list = bubbles.createOutline(
                BubbleSet.addPadding(thisrects, 5),
                BubbleSet.addPadding(otherrects, 5),
                null /* lines */
            )

            var outline = new PointPath(list).transform([
                new ShapeSimplifier(0.0),
                new BSplineShapeGenerator(),
                new ShapeSimplifier(0.0),
            ])

            bubblesets.push(outline.toString())

            var thisvararray = []
            for(var v in thisvars) {
                thisvararray.push({
                    text:v, 
                    count:thisvars[v].count, 
                    loc:[thisvars[v].loc[0]/thisvars[v].count, thisvars[v].loc[1]/thisvars[v].count]
                })
            }
            variablesets = variablesets.concat(thisvararray)
        }

        this._bubbleSets = bubblesets
        this._variableSets = variablesets
    }

    _visitHierarchy(node, leaves) {
        if('value' in node) {
            leaves.push(node.value);
        }
        else {
            this._visitHierarchy(node.left, leaves);
            this._visitHierarchy(node.right, leaves);
        }
	}	

    _computeClusters() {
        // clustering
        var distances = this._computeDistanceMatrix(this._charts)
        var hclclusters = clusterfck.hcluster(
            this._charts.map((ch) => {return ch.chid}), 
            (c1, c2) => {
                var idx1 = _.findIndex(this._charts, (ch) => {return ch.chid == c1})
                var idx2 = _.findIndex(this._charts, (ch) => {return ch.chid == c2})
                return distances[idx1][idx2]
            }, 
            clusterfck.AVERAGE_LINKAGE, this._params.clthreshold)

        // flatten hierarchy
        this._clusterNum = hclclusters.length
		hclclusters.forEach((clg, idx) => {
			var cluster = [];
			this._visitHierarchy(clg, cluster);
            cluster.forEach((item) => { 
                var chart = _.find(this._charts, (ch)=>{return ch.chid == item})
                chart.clid = idx
            })
		});

        // assign cluster
        // this._charts.forEach((ch) => {
        //     var cl = _.find(clusters, (cl) => {return cl.chid == ch.chid})
        //     ch.clid = cl.clid
        // })       
    }

    _computeProjection(hasembedding, callback) {
        if(!hasembedding) {
            var chartspecs = this._charts.map((d) => {return d.normspec})

            $.ajax({
                type: 'POST',
                crossDomain: true,
                url: this.conf.backend + '/encode',
                data: JSON.stringify(chartspecs),
                contentType: 'application/json'
            }).then((data) => {
                this._charts.forEach((d, i) => { d.embedding = data[i]})
                var distances = this._computeDistanceMatrix(this._charts)
                return $.ajax({
                    type: 'POST',
                    crossDomain: true,
                    url: this.conf.backend + '/mds',
                    data: JSON.stringify(distances),
                    contentType: 'application/json'
                })
            }).then((data) => {
                if(this._prevcharts.length <= 3)
                    return data

                var precoords = this._alignCoordinates()
                return $.ajax({
                    type: 'POST',
                    crossDomain: true,
                    url: this.conf.backend + '/orientate',
                    data: JSON.stringify([precoords, data]),
                    contentType: 'application/json'
                })
            }).done((data) => {
                this._adjustScale(data)
                this._charts.forEach((d, i) => {
                    d.coords = data[i] //为坐标赋值
                })
                console.log(this._charts)
                callback()
            })
        }
        else {
            var distances = this._computeDistanceMatrix(this._charts)
            $.ajax({
                type: 'POST',
                crossDomain: true,
                url: this.conf.backend + '/mds',
                data: JSON.stringify(distances),
                contentType: 'application/json'
            }).then((data) => {
                if(this._prevcharts.length == 0)
                    return data

                var precoords = this._alignCoordinates()

                return $.ajax({
                    type: 'POST',
                    crossDomain: true,
                    url: this.conf.backend + '/orientate',
                    data: JSON.stringify([precoords, data]),
                    contentType: 'application/json'
                })
            }).done((data) => {
                this._adjustScale(data)
                this._charts.forEach((d, i) => {
                    d.coords = data[i]
                })
                console.log(this._charts)
                if(callback) callback()
            })
        }
        
    }

    _computeDistanceMatrix(charts) {//计算所有图表的距离
        var distances = []
        for(var i = 0; i < charts.length; i++) {
            distances.push([])
            for(var j = 0; j < charts.length; j++) {
                if(i == j) {
                    distances[i][j] = 0
                }
                else if(j < i) {
                    distances[i][j] = distances[j][i]
                }
                else {
                    distances[i][j] = this._chartDistance(charts[i], charts[j])
                }
            }
        }

        return distances
    }

        _chartDistance(chart1, chart2) {//加权距离公式,α
            var endist = 0
            console.log(chart1.embedding.length);
            for(var z = 0; z < chart1.embedding.length; z++) {
                var d = chart1.embedding[z] - chart2.embedding[z]
                endist += d * d
            }
            endist = Math.sqrt(endist)
            // variable distance - Jaccard
            var vardist = 1 - _.intersection(chart1.vars, chart2.vars).length / 
            _.union(chart1.vars, chart2.vars).length
            // variable distance - Cosine
            // var vardist = _.intersection(charts[i].vars, charts[j].vars).length / this.data.chartdata.attributes.length

            return this._params.distw * endist + (1 - this._params.distw) * vardist 
        }

    _alignCoordinates() {
        var chids1 = this._prevcharts.map((ch) => {return ch.chid})
        var chids2 = this._charts.map((ch) => {return ch.chid}) 
        
        var coords1 = this._prevcharts.map((ch) => {return ch.coords})
        var newcords1 = []
        chids2.forEach((chid) => {
            var idx = chids1.indexOf(chid)
            if(idx != -1)
                newcords1.push(coords1[idx])
            else
                newcords1.push([0, 0])
        })

        return newcords1
    }

    _adjustScale(coords) {
        var min0 = Number.MAX_VALUE, min1 = Number.MAX_VALUE, 
            max0 = Number.MIN_VALUE, max1 = Number.MIN_VALUE
        coords.forEach((d) => {
            min0 = Math.min(min0, d[0])
            min1 = Math.min(min1, d[1])
            max0 = Math.max(max0, d[0])
            max1 = Math.max(max1, d[1])
        })

        this._xscale.domain([min0, max0])
        this._yscale.domain([min1, max1])
    }
    
    _restoreSpec(normspec, p, vars = []) {
        // use kNN to get data variables
        var neighbors = this._kNN(p, this._params.ngbrN)
        var attributesMap = {}
        this.data.chartdata.attributes.forEach((d) => {
            attributesMap[d[0]] = d.concat([0])
        })
        // fill in data variables
        var re = /"field":"(\w+)"/g
        neighbors.forEach((ch) => {
            var sp = JSON.stringify(ch.originalspec), found
            while((found = re.exec(sp)) !== null) {
                attributesMap[found[1]][3] += 1
            }
        })
        var attributes = _.sortBy(_.values(attributesMap), (d) => {return -d[3]})
        var numattrs = _.filter(attributes, (d) => {return d[1] == 'num'})
        numattrs.current = 0
        var strattrs = _.filter(attributes, (d) => {return d[1] == 'str'})
        strattrs.current = 0

        // var i = 0
        // normspec = normspec.replace(/num/g, (m, p, offset) => {
        //     var attr = numattrs[i++ % numattrs.length][0]
        //     vars.push(attr)
        //     return attr
        // })
        // i = 0
        // normspec = normspec.replace(/str/g, (m, p, offset) => {
        //     var attr = strattrs[i++ % strattrs.length][0]
        //     vars.push(attr)
        //     return attr
        // })

        var spec = JSON.parse(normspec)
        this._formSpec(spec, attributesMap, numattrs, strattrs, vars)

        return spec
    }

    _formSpec(node, attributesMap, numattrs, strattrs, vars) {
        if(typeof node != 'object') return
        // fix bad channels: shape-num, size-str
        if(node['shape'] && node['shape']['field'] == 'num')
            node['shape']['field'] = 'str' 
        if(node['size'] && node['size']['field'] == 'str')
            node['size']['field'] = 'num' 
        if(node['field']) {
            // assign field
            if(node['field'] == 'num') 
                node['field'] = numattrs[numattrs.current++ % numattrs.length][0]
            if(node['field'] == 'str') 
                node['field'] = strattrs[strattrs.current++ % strattrs.length][0]
            vars.push(node['field'])
            // correct field type
            node['type'] = attributesMap[node['field']][2]
            if(node['type'] != 'temporal' && node['timeUnit'])
                delete node['timeUnit']
            if(node['type'] != 'quantitative' && (node['aggregate'] || node['bin'])) {
                delete node['aggregate']
                delete node['bin']
            }
        }
        
        for(var f in node) {
            this._formSpec(node[f], attributesMap, numattrs, strattrs, vars)
        }
    }
    _setVars(node, vars) {
        if(typeof node != 'object') return
        if(node['field']) {
            vars.push(node['field'])
        }
        
        for(var f in node) {
            this._setVars(node[f], vars)
        }
    }
    _kNN(p, k) {
        //var charts = _.filter(this._charts, ['created', false])
        var charts = _.sortBy(this._charts, (d) => {
            // var sum = 0
            // for(var i = 0; i < d.embedding.length; i++)
            //     sum += (p[i] - d.embedding[i]) * (p[i] - d.embedding[i])
            // return sum
            return (p[0] - d.coords[0]) * (p[0] - d.coords[0]) + (p[1] - d.coords[1]) * (p[1] - d.coords[1])
        })

        return charts.slice(0, k)
    }

    _rankCharts(vlcharts) {
        var schema = cql.schema.build(this.data.chartdata.values)
        var specmodels = vlcharts.map((vlch, i) => {
            var sp = vlch.originalspec
            var queryspec = {
                id: i,
                data: this.data.chartdata.values,
                mark: sp.mark,
                encodings: [] 
            }
            for(var en in sp.encoding) {
                queryspec.encodings.push({channel:en, field:sp.encoding[en].field, type:sp.encoding[en].type })
            }
            return SpecQueryModel.build(queryspec, schema, {})
        })

        var results = rank({name:'', path:'', items:specmodels}, {'orderBy':'effectiveness'}, schema)
        var resultvlcharts = []
        for(var i = 0; i < this._params.recnum; i++) {
            resultvlcharts.push(vlcharts[results.items[i].specQuery.id])
        }

        return resultvlcharts
    }

    _recommendCharts(pt) {
        var coords = []
        var xr = this._params.recradius * (this.conf.size[0] - this.conf.margin * 2),
            yr = this._params.recradius * (this.conf.size[1] - this.conf.margin * 2)
        for(var i = 0; i < this._params.recnum * 5; i++) {
            var x = this._xscale.invert(pt[0] + xr * _.random(-1, 1, true)),
                y = this._yscale.invert(pt[1] + yr * _.random(-1, 1, true))
            coords.push([x, y])
        }
        console.log(coords)
        var embeddings = [], normspecs = []

        var edist = this._estimateDistances(coords, [this._xscale.invert(pt[0]), this._yscale.invert(pt[1])])
        var chps = this._charts.map((ch) => {return ch.embedding})

        $.ajax({
            context: this,
            type: 'POST',
            crossDomain: true,
            url: this.conf.backend + '/invmds',    
            //data: JSON.stringify(coords),
            data: JSON.stringify({points: chps,  distances: edist}),
            contentType: 'application/json'
        }).then((data) => {
            embeddings = data
            return $.ajax({
                context: this,
                type: 'POST',
                crossDomain: true,
                url: this.conf.backend + '/decode',
                data: JSON.stringify(data),
                contentType: 'application/json'
            })
        }).then((data) => {
            embeddings = data;
            return $.ajax({
                context: this,
                type: 'POST',
                crossDomain: true,
                url: this.conf.backend + '/decode_llm', // 修改URL为新的后端处理路径
                data: JSON.stringify(data),
                contentType: 'application/json',
                success: function(response) {
                    console.log("处理结果:", response);
                },
                error: function(error) {
                    console.error("请求失败:", error);
                }
            })
        }).done((data) => {
            normspecs = data.codes
            console.log(data.explanations)
            var vlcharts = {}
            for(var i = 0; i < normspecs.length; i++) {
                //if(normspecs[i] in vlcharts) continue
//                var varnum = (normspecs[i].match(/num|str/g) || []).length
//                // no variable chart skip
//                if(varnum == 0) continue

                var vars = []
                this._setVars(normspecs[i],vars)
                // var sp = this._restoreSpec(normspecs[i], coords[i], vars)

                vlcharts[JSON.stringify(normspecs[i])] = {
                    originalspec: normspecs[i],
                    vars: _.uniq(vars),
                    index: i
                }
            }
//         }).done((data) => {
//             normspecs = data
//             console.log(data)
//             var vlcharts = {}
//             for(var i = 0; i < normspecs.length; i++) {
//                 //if(normspecs[i] in vlcharts) continue
//                 var varnum = (normspecs[i].match(/num|str/g) || []).length
//                 // no variable chart skip
//                 if(varnum == 0) continue
//
//                 var vars = []
//                 var sp = this._restoreSpec(normspecs[i], coords[i], vars)
//
//                 vlcharts[JSON.stringify(sp)] = {
//                     originalspec: sp,
//                     vars: _.uniq(vars),
//                     index: i
//                 }
//             }
            console.log(vlcharts)
            
            vlcharts = _.values(vlcharts)
            Promise.all(vlcharts.map((chsp) => {
                return vegaEmbed('#vegatest', _.extend({}, chsp.originalspec, 
                    { data: {values: this.data.chartdata.values} }
                )).catch((err) => { }) // drop on vegalite error
            })).then((vl) => {
                console.log(vl)                
                vlcharts = _.filter(vlcharts, (v, i) => {return vl[i]})
//                vlcharts = this._rankCharts(vlcharts)

                for(var i = 0; i < vl.length; i++) {
                    if(vl[i]) {
                        var chart = {
                            originalspec: vlcharts[i].originalspec,
                            normspec: normspecs[vlcharts[i].index],
                            embedding: embeddings[vlcharts[i].index],
                            coords: coords[vlcharts[i].index],
                            vars: vlcharts[i].vars,
                            created: true,
                            chid: this._charts[this._charts.length - 1].chid + 1,
                            uid: 0
                        }
                        this._charts.push(chart)
                    }
                }
            }).finally(() => {
                this.render()
                this.emit('recommendchart')
            })
        })
    }

    _estimateDistances(coords) {  //估计新推荐的图表与现有图表之间的距离 二维数组
        var charts = this._charts

        var edist = []//edist 用于存储估计的距离
        for(var i = 0; i < coords.length; i++) {
            edist.push([])

            var cpvars = []
            this._kNN(coords[i], this._params.ngbrN).forEach((ch) => {
                cpvars = _.union(cpvars, ch.vars) //得到当前坐标的变量集合。
            })

            for(var j = 0; j < charts.length; j++) {
                var vdist = 1 - _.intersection(cpvars, charts[j].vars).length / _.union(cpvars, charts[j].vars).length

                var d = (coords[i][0] - charts[j].coords[0]) * (coords[i][0] - charts[j].coords[0])
                    + (coords[i][1] - charts[j].coords[1]) * (coords[i][1] - charts[j].coords[1])
                edist[i].push( (Math.sqrt(d) - (1 - this._params.distw) * vdist) / this._params.distw )
            }
        }

        return edist //edist[i][j] 表示新推荐图表的第 i 个坐标与现有图表中第 j 个图表之间的估计距离
    }
}