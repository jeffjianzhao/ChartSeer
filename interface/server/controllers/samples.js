 var express = require("express"),
	router = express.Router(),
	mongoose = require("mongoose"),
	Sample = mongoose.model("Sample");


module.exports = function (app) {
	app.use("/api", router);	
};

router.route("/sample/:val")
	.get(function(req, res) {
		Sample.find({value: req.params.val})
			.exec(function(err, data) {
				console.log('DB: found!');
				if(err)
					res.send(err);
				else 
					res.json(data);
			});
	});