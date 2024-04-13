/*************************************************************************
 * Copyright (c) 2018 Jian Zhao
 *
 *************************************************************************
 *
 * @author
 * Jian Zhao <zhao@fxpal.com>
 *
 *************************************************************************/

import { EventEmitter } from "events"

import ace from 'ace-builds/src-noconflict/ace'
import 'ace-builds/webpack-resolver'
import vegaEmbed from 'vega-embed'

export default class ChartView extends EventEmitter {
    constructor(data, conf) {
        super()

        // global variable: window.app
        this.data = data
        this.conf = conf

        this._attributeTypeMap = {}
        this.conf.attributes.forEach((att) => {
            this._attributeTypeMap[att[0]] = att[2]
        })

        this._init()
    }

    _init() {
        // text editor
        // this._cheditor = ace.edit('editorcontainer', {
        //     mode: 'ace/mode/json',
        //     minLines: 20
        // })

        // ui controls
        var html = ''

        var comps = ['ch-x', 'ch-y', 'ch-color', 'ch-size', 'ch-shape']
        comps.forEach((comp) => {
            html = '<option value="-">-</option>'
            this.conf.attributes.forEach((d) => {
                html += '<option value="' + d[0] + '">' + d[0] + '</option>'
            })
            $('#' + comp).append(html)
        })
    
        var marks = ['bar', 'point', 'area', 'circle', 'line', 'tick']
        html = ''
        marks.forEach((d) => {
            html += '<option value="' + d + '">' + d + '</option>'
        })
        $('#ch-mark').append(html)
        
        var comps = ['ch-xtrans', 'ch-ytrans', 'ch-colortrans', 'ch-sizetrans']
        var aggs = ['-', 'count', 'mean', 'sum', 'bin']
        comps.forEach((comp) => {
            html = ''
            aggs.forEach((d) => {
                html += '<option value="' + d + '">' + d + '</option>'
            })
    
            $('#' + comp).append(html)
        })

        // buttons
        $('#add').click((e) => {
            this.update(this._cheditor.session.getValue(), 'texteditor')
            this.emit('add-chart', this.data)
        })

        $('#update').click((e) => {
            if(app.sumview.selectedChartID < 0) return
            this.update(this._cheditor.session.getValue(), 'texteditor')
            this.emit('update-chart', this.data)
        })

        $('#remove').click((e) => {
            if(app.sumview.selectedChartID < 0) return

            this.emit('remove-chart', this.data)
        })

        //这行代码为ID为preview1的元素注册了一个点击事件处理器。在这个处理器中，
        // 它首先克隆当前的数据，然后根据用户选择的选项更新数据的编码。然后，它调用_validateChart方法来验证图表，并使用update方法来更新图表。
        $('#preview1').click((e) => {
            var data = _.cloneDeep(this.data)
            data['mark'] = $('#ch-mark').val()

            if(!data['encoding'])
                data['encoding'] = {}

            var channels = ['x', 'y', 'color', 'size', 'shape']
            channels.forEach((channel) => {
                if(!data['encoding'][channel])
                    data['encoding'][channel] = {}

                if(channel != 'shape') {
                    var val = $('#ch-' + channel + 'trans').val()
                    if(val == 'bin')
                        data['encoding'][channel]['bin'] = true
                    else if(val != '-')
                        data['encoding'][channel]['aggregate'] = val
                    else {
                        delete data['encoding'][channel]['aggregate']
                        delete data['encoding'][channel]['bin']
                    }
                }

                var val = $('#ch-' + channel).val()
                if(val != '-') {
                    data['encoding'][channel]['field'] = val
                    data['encoding'][channel]['type'] = this._attributeTypeMap[val]
                }
                else
                    delete data['encoding'][channel]
            })

            this._validateChart(data, () => {this.update(data, 'uicontrols')})
        })

        //这行代码为ID为preview2的元素注册了一个点击事件处理器。在这个处理器中，
        // 它首先从编辑器中获取数据，然后调用_validateChart方法来验证图表，并使用update方法来更新图表。
        $('#preview2').click((e) => {
            var data = this._cheditor.session.getValue()
            this._validateChart(data, () => {this.update(data, 'texteditor')})            
        })
    
        $('#cancel1, #cancel2').click((e) => {
            if(app.sumview.selectedChartID >= 0) {
                var ch = app.sumview.charts[app.sumview.selectedChartID]
                this.update(ch.originalspec, 'outside')
            }
        })
    }

    update(data, eventsource) {
        // handle data parsing, string or object
        if(typeof data == 'string') {
            try {
                this.data = JSON.parse(data)
            }
            catch(err) {
                console.log(err)
                return
            }
        }
        else if(typeof data == 'object') {
            this.data = data
        }

        var vegachart = _.extend({}, this.data, 
            { width: 335, height: 180, autosize: 'fit' }, 
            { data: {values: this.conf.datavalues} },
            { config: this.conf.vegaconfig})
        vegaEmbed('#chartview .chartcontainer', vegachart, {actions: false})

        if(eventsource != 'texteditor')
            this._cheditor.session.setValue(JSON.stringify(this.data, null, '  '))
        
        if(eventsource != 'uicontrols')
            this._updateChartComposer()
    }

    _updateChartComposer() {
        if(this.data['mark'])
            $('#ch-mark').val(this.data['mark'])
        
        var channels = ['x', 'y', 'color', 'size', 'shape']
        channels.forEach((ch) => {
            if(this.data['encoding'][ch]) {
                $('#ch-' + ch).val(this.data['encoding'][ch]['field'])
    
                if(ch != 'shape') {
                    if(this.data['encoding'][ch]['bin'] == true)
                        $('#ch-' + ch + 'trans').val('bin')
                    else if(this.data['encoding'][ch]['aggregate'])
                        $('#ch-' + ch + 'trans').val(this.data['encoding'][ch]['aggregate'])
                    else
                        $('#ch-' + ch + 'trans').val('-')
                }
            }
            else {
                $('#ch-' + ch).val('-')
                if(ch != 'shape') $('#ch-' + ch + 'trans').val('-')
            }
        })
    }

    //这是一个方法，它接收一个图表和一个回调函数作为参数。
    // 这个方法首先将图表转换为字符串，然后替换字符串中的属性名，最后删除所有的空白字符。

    _validateChart(chart, callback) {
        var sp = chart
        if(typeof chart == 'object') 
            sp = JSON.stringify(chart)
    
        app.data.chartdata.attributes.forEach((attr) => {
            sp = sp.replace(new RegExp(attr[0], 'g'), (m) => {
                return attr[1]
            })
        }) 
        sp = sp.replace(/[\s|\n]+/g, '')

        $.ajax({
            type: 'POST',
            crossDomain: true,
            url: app.sumview.conf.backend + '/encode',
            data: JSON.stringify([sp]),
            contentType: 'application/json'
        }).done((data) => {
            callback()
        }).fail((xhr, status, error) => {
            alert('This chart is not supported.')
        })
    }
}