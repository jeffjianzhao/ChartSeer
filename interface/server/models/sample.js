var mongoose = require('mongoose');

var sampleSchema = mongoose.Schema({
	value: {type: Number, index: true},
});

module.exports = mongoose.model('Sample', sampleSchema);
