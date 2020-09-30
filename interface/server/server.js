const express = require('express')

const bodyParser = require('body-parser'),
	compress = require('compression'),
	methodOverride = require('method-override')

const webpackMiddleware = require('webpack-dev-middleware'),
	webpack = require('webpack'),
	webpackConfig = require('../webpack.config.js')

const app = express()
// configure
if(process.env.NODE_ENV != 'prod')
	app.use(webpackMiddleware(webpack(webpackConfig)))
app.use(bodyParser.json({limit: '50mb'}));
app.use(bodyParser.urlencoded({extended: true, limit: '50mb', parameterLimit: 50000}))
app.use(compress())
app.use(methodOverride())
// static directories
app.use(express.static('public'))
app.use('/data', express.static('staticdata'))
// start listening
app.listen(8000, function() {
	console.log('Server: listening 8000')
});;
