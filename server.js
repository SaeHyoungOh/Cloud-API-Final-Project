/******************************************************************************
* Program Name:		Portfolio Assignment: Final Project
* Author:			Sae Hyoung Oh
* Last Modified:	6/1/2020
* Description:
*	This is the controller portion of the API. It uses Node.js and express.
*	The controller functions require the model functions from model.js to
*	interact with Google Cloud Datastore.
******************************************************************************/

// express
const express = require('express');
const app = express();

// handlebars
const handlebars = require('express-handlebars').create({ defaultLayout: 'main' });
app.engine('handlebars', handlebars.engine);
app.set('view engine', 'handlebars');

// directories
const path = require('path');
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'views')));

// body parser
const bodyParser = require('body-parser');
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

var jwtDecode = require('jwt-decode');

// constants
const BOAT = "boat";
const SLIP = "slip";
const LOAD = "load";
const USER = "user";
const kindInURL = ["boats", "slips", "loads", "users"];
const model = require('./model');

// router
const router = express.Router();

app.use(bodyParser.json());

// controller functions
// welcome page
router.get('/welcome', function (req, res) {
	res.render('welcome');
});

// redirecting the user to Google auth api
router.post('/welcome', function (req, res) {
	model.googleURL().then(url => {
		res.redirect(url);
	});
});

// process auth and display on page
router.get('/UserInfo', function (req, res) {
	model.getToken(req).then(result => model.getUserData(result)).then(data => {
		res.render("UserInfo", data);
	});
});

// get all items of a kind (for development use only)
router.get('/dev/:kind', function (req, res) {
	const kind = model.getKind(req);			// determine the kind of item
	model.getAllItems(kind, req).then(items => {
		var result = {};
		result.items = items;
		result.count = items.length;
		res.status(200).json(result);
	});
});

// delete all items of a kind (for development use only)
router.delete('/dev/:kind', function (req, res) {
	const kind = model.getKind(req);			// determine the kind of item
	model.deleteAllItems(kind, req).then(() => res.status(204).end());
});


// invalid kinds, not allowed HTML methods
router.get('/:kind', function (req, res, next) {
	// wrong kind
	if (!kindInURL.includes(req.params.kind))
		res.status(404).json({ "Error": "The provided kind is invalid" });
	else
		next();
});
router.get('/:kind/:id', function (req, res, next) {
	// wrong kind
	if (!kindInURL.includes(req.params.kind))
		res.status(404).json({ "Error": "The provided kind is invalid" });
	else
		next();
});
router.post('/:kind', function (req, res, next) {
	// wrong kind
	if (!kindInURL.includes(req.params.kind))
		res.status(404).json({ "Error": "The provided kind is invalid" });
	else
		next();
});
router.post('/:kind/:id', function (req, res, next) {
	// wrong kind
	if (!kindInURL.includes(req.params.kind))
		res.status(404).json({ "Error": "The provided kind is invalid" });
	// do not allow POST on in individual items
	else {
		res.set("Allow", "GET, PATCH, PUT, DELETE");
		res.status(405).json({ "Error": "This HTML method for the request URL is not allowed" });
	}
});
router.patch('/:kind', function (req, res, next) {
	// wrong kind
	if (!kindInURL.includes(req.params.kind))
		res.status(404).json({ "Error": "The provided kind is invalid" });
	// do not allow PATCH on root kind
	else {
		res.set("Allow", "GET, POST");
		res.status(405).json({ "Error": "This HTML method for the request URL is not allowed" });
	}
});
router.patch('/:kind/:id', function (req, res, next) {
	// wrong kind
	if (!kindInURL.includes(req.params.kind))
		res.status(404).json({ "Error": "The provided kind is invalid" });
	// do not allow put or delete on root kind
	else
		next();
});
router.put('/:kind', function (req, res, next) {
	// wrong kind
	if (!kindInURL.includes(req.params.kind))
		res.status(404).json({ "Error": "The provided kind is invalid" });
	// do not allow PUT on root kind
	else {
		res.set("Allow", "GET, POST");
		res.status(405).json({ "Error": "This HTML method for the request URL is not allowed" });
	}
});
router.put('/:kind/:id', function (req, res, next) {
	// wrong kind
	if (!kindInURL.includes(req.params.kind))
		res.status(404).json({ "Error": "The provided kind is invalid" });
	else
		next();
});
router.delete('/:kind', function (req, res, next) {
	// wrong kind
	if (!kindInURL.includes(req.params.kind))
		res.status(404).json({ "Error": "The provided kind is invalid" });
	// do not allow DELETE on root kind
	else {
		res.set("Allow", "GET, POST");
		res.status(405).json({ "Error": "This HTML method for the request URL is not allowed" });
	}
});
router.delete('/:kind/:id', function (req, res, next) {
	// wrong kind
	if (!kindInURL.includes(req.params.kind))
		res.status(404).json({ "Error": "The provided kind is invalid" });
	else
		next();
});

// nothing is allowed on base URL
router.get('/', function (req, res) {
	res.status(404).json({ "Error": "The provided URL is invalid" });
});
router.post('/', function (req, res) {
	res.status(404).json({ "Error": "The provided URL is invalid" });
});
router.patch('/', function (req, res) {
	res.status(404).json({ "Error": "The provided URL is invalid" });
});
router.put('/', function (req, res) {
	res.status(404).json({ "Error": "The provided URL is invalid" });
});
router.delete('/', function (req, res) {
	res.status(404).json({ "Error": "The provided URL is invalid" });
});


// get all items of a kind
router.get('/:kind', function (req, res) {
	const accepts = req.accepts(['application/json', 'text/html']);
	const kind = model.getKind(req);			// determine the kind of item
	var jwt = req.get("authorization");

	// request accept type not supported
	if (!accepts)
		res.status(406).json({ "Error": "The Accept type is not supported by this endpoint" });
	else if (kind == BOAT && !jwt)
		res.status(401).json({ "Error": "The user token is missing" });
	else if (kind == BOAT && jwt.split(" ")[0] != "Bearer")
		res.status(401).json({ "Error": "The user token is invalid" });
	else {
		// get the cursor
		var cursor;
		if (req.query.cursor) {
			cursor = req.query.cursor.replace(/ /g, '+');
		}
		// get the user ID
		if (kind == BOAT)
			jwt = jwt.split(" ")[1];
		var sub;
		try {
			if (kind == BOAT)
				sub = jwtDecode(jwt).sub;
			else
				sub = null;
			// check the user ID
			model.getUserID(kind, sub).then(userID => {
				if ((kind == BOAT && userID) || kind != BOAT) {
					// get the items
					model.getAllItemsPagination(kind, req, cursor, userID).then(items => {
						if (accepts == "application/json")
							res.status(200).json(items);
						else if (accepts == "text/html")
							res.status(200).send(model.toHTML(items));
					});
				} else
					res.status(401).json({ "Error": "The user token is invalid" });
			});
		} catch (err) {
			console.log(err);
			// handle jwt-decode error
			res.status(401).json({ "Error": "The user token is invalid" });
		}
	}
});

// get one item
router.get('/:kind/:id', function (req, res) {
	const accepts = req.accepts(['application/json', 'text/html']);
	const kind = model.getKind(req);			// determine the kind of item
	var jwt = req.get("authorization");

	// request accept type not supported
	if (!accepts)
		res.status(406).json({ "Error": "The Accept type is not supported by this endpoint" });
	else if (kind == BOAT && !jwt)
		res.status(401).json({ "Error": "The user token is missing" });
	else if (kind == BOAT && jwt.split(" ")[0] != "Bearer")
		res.status(401).json({ "Error": "The user token is invalid" });
	else {
		// get the user ID
		if (kind == BOAT)
			jwt = jwt.split(" ")[1];
		var sub;
		try {
			if (kind == BOAT)
				sub = jwtDecode(jwt).sub;
			else
				sub = null;
			// check for user ID
			model.getUserID(kind, sub).then(userID => {
				if ((kind == BOAT && userID) || kind != BOAT) {
					// get the item
					model.getItem(kind, req.params.id, req).then(item => {
						if (item) {
							if ((kind == BOAT && item.owner == sub) || kind != BOAT) {
								if (accepts == "application/json")
									res.status(200).json(item);
								else if (accepts == "text/html")
									res.status(200).send(model.toHTML(item));
							} else
								res.status(403).json({ "Error": "The " + kind + " is owned by someone else" });
						} else
							res.status(404).json({ "Error": "No " + kind + " with this " + kind + "_id exists" });
					});
				} else
					res.status(401).json({ "Error": "The user token is invalid" });
			});
		} catch (err) {
			console.log(err);
			// handle jwt-decode error
			res.status(401).json({ "Error": "The user token is invalid" });
		}
	}
});

// add an item
router.post('/:kind', function (req, res) {
	const accepts = req.accepts(['application/json', 'text/html']);
	const kind = model.getKind(req);			// determine the kind of item
	const arg = model.argsProvided(kind, req);	// make sure arguments are provided
	var jwt = req.get("authorization");

	// request accept type not supported
	if (!accepts)
		res.status(406).json({ "Error": "The Accept type is not supported by this endpoint" });
	// request content type not supported
	else if (req.get('content-type') !== 'application/json')
		res.status(415).json({ "Error": "The request Content Type is unsupported media type" });
	// missing arguments
	else if (!arg)
		res.status(400).json({ "Error": "The request object is missing at least one of the required attributes" });
	else if (kind == BOAT && !jwt)
		res.status(401).json({ "Error": "The user token is missing" });
	else if (kind == BOAT && jwt.split(" ")[0] != "Bearer")
		res.status(401).json({ "Error": "The user token is invalid" });
	else if (kind == USER) {
		res.set("Allow", "GET");
		res.status(405).json({ "Error": "This HTML method for the request URL is not allowed" });
	}
	else {
		// if user token is provided
		if (kind == BOAT)
			jwt = jwt.split(" ")[1];
		var sub;
		try {
			if (kind == BOAT)
				sub = jwtDecode(jwt).sub;
			else
				sub = null;
			// check for user ID
			model.getUserID(USER, sub).then(userID => {
				if ((kind == BOAT && userID) || kind != BOAT) {
					// check input attributes
					model.inputCheck(kind, req, res).then(goodInput => {
						if (goodInput) {
							// add item
							model.newItem(kind, req).then(item => {
								if (accepts == "application/json")
									res.status(201).json(item);
								else if (accepts == "text/html")
									res.status(201).send(toHTML(item));
							});
						}
					});
				} else
					res.status(401).json({ "Error": "The user token is invalid" });
			});
		} catch (err) {
			console.log(err);
			// handle jwt-decode error
			res.status(401).json({ "Error": "The user token is invalid" });
		}
	}
});

// modify selected attributes of an item
router.patch('/:kind/:id', function (req, res) {
	const accepts = req.accepts(['application/json', 'text/html']);
	const kind = model.getKind(req);			// determine the kind of item
	var jwt = req.get("authorization");

	// request accept type not supported
	if (!accepts)
		res.status(406).json({ "Error": "The Accept type is not supported by this endpoint" });
	// request content type not supported
	else if (req.get('content-type') !== 'application/json')
		res.status(415).json({ "Error": "The request Content Type is unsupported media type" });
	else if (kind == BOAT && !jwt)
		res.status(401).json({ "Error": "The user token is missing" });
	else if (kind == BOAT && jwt.split(" ")[0] != "Bearer")
		res.status(401).json({ "Error": "The user token is invalid" });
	else if (kind == USER) {
		res.set("Allow", "GET");
		res.status(405).json({ "Error": "This HTML method for the request URL is not allowed" });
	}
	else {
		// if user token is provided
		if (kind == BOAT)
			jwt = jwt.split(" ")[1];
		var sub;
		try {
			if (kind == BOAT)
				sub = jwtDecode(jwt).sub;
			else
				sub = null;
			// check for user ID
			model.getUserID(USER, sub).then(userID => {
				if ((kind == BOAT && userID) || kind != BOAT) {
					// call the model GET function to make sure it exists
					model.getItem(kind, req.params.id, req).then((item) => {
						if (item) {
							if ((kind == BOAT && item.owner == sub) || kind != BOAT) {
							// check input attributes
								model.inputCheck(kind, req, res).then(goodInput => {
									if (goodInput) {
										model.patchItem(kind, req.params.id, req, item).then(item => {
											if (accepts == "application/json")
												res.status(200).json(item);
											else if (accepts == "text/html")
												res.status(200).send(model.toHTML(item));
										});
									}
								});
							} else
								res.status(403).json({ "Error": "The " + kind + " is owned by someone else" });
						} else
							// id does not exist
							res.status(404).json({ "Error": "No " + kind + " with this " + kind + "_id exists" });
					});
				} else
					res.status(401).json({ "Error": "The user token is invalid" });
			});
		} catch (err) {
			console.log(err);
			// handle jwt-decode error
			res.status(401).json({ "Error": "The user token is invalid" });
		}
	}
});

// modify all attributes of an item
router.put('/:kind/:id', function (req, res) {
	const accepts = req.accepts(['application/json', 'text/html']);
	const kind = model.getKind(req);			// determine the kind of item
	const arg = model.argsProvided(kind, req);	// make sure arguments are provided
	var jwt = req.get("authorization");

	// request accept type not supported
	if (!accepts)
		res.status(406).json({ "Error": "The Accept type is not supported by this endpoint" });
	// request content type not supported
	else if (req.get('content-type') !== 'application/json')
		res.status(415).json({ "Error": "The request Content Type is unsupported media type" });
	// missing arguments
	else if (!arg)
		res.status(400).json({ "Error": "The request object is missing at least one of the required attributes" });
	else if (kind == BOAT && !jwt)
		res.status(401).json({ "Error": "The user token is missing" });
	else if (kind == BOAT && jwt.split(" ")[0] != "Bearer")
		res.status(401).json({ "Error": "The user token is invalid" });
	else if (kind == USER) {
		res.set("Allow", "GET");
		res.status(405).json({ "Error": "This HTML method for the request URL is not allowed" });
	}
	else {
		// if user token is provided
		if (kind == BOAT)
			jwt = jwt.split(" ")[1];
		var sub;
		try {
			if (kind == BOAT)
				sub = jwtDecode(jwt).sub;
			else
				sub = null;
			// check for user ID
			model.getUserID(USER, sub).then(userID => {
				if ((kind == BOAT && userID) || kind != BOAT) {
					// call the model GET function to make sure it exists
					model.getItem(kind, req.params.id, req).then((item) => {
						if (item) {
							if ((kind == BOAT && item.owner == sub) || kind != BOAT) {
								// check input attributes
								model.inputCheck(kind, req, res).then(goodInput => {
									if (goodInput) {
										model.putItem(kind, req.params.id, req, item).then(item => {
											// set the location header
											res.location(item.self);
											if (accepts == "application/json")
												res.status(303).json(item);
											else if (accepts == "text/html")
												res.status(303).send(model.toHTML(item));
										});
									} else
										res.status(403).json({ "Error": "The " + kind + " is owned by someone else" });
								});
							} else
								res.status(403).json({ "Error": "The " + kind + " is owned by someone else" });
						} else
							// id does not exist
							res.status(404).json({ "Error": "No " + kind + " with this " + kind + "_id exists" });
					});
				} else
					res.status(401).json({ "Error": "The user token is invalid" });
			});
		} catch (err) {
			console.log(err);
			// handle jwt-decode error
			res.status(401).json({ "Error": "The user token is invalid" });
		}
	}
});

// delete an item
router.delete('/:kind/:id', function (req, res) {
	const kind = model.getKind(req);			// determine the kind of item
	var jwt = req.get("authorization");

	if (kind == BOAT && !jwt)
		res.status(401).json({ "Error": "The user token is missing" });
	else if (kind == BOAT && jwt.split(" ")[0] != "Bearer")
		res.status(401).json({ "Error": "The user token is invalid" });
	else {
		// if user token is provided
		if (kind == BOAT)
			jwt = jwt.split(" ")[1];
		var sub;
		try {
			if (kind == BOAT)
				sub = jwtDecode(jwt).sub;
			else
				sub = null;
			// check for user ID
			model.getUserID(USER, sub).then(userID => {
				if ((kind == BOAT && userID) || kind != BOAT) {
					// call the model GET function to make sure it exists
					model.getItem(kind, req.params.id, req).then((item) => {
						if (item) {
							if (item.owner == sub)
								model.deleteItem(kind, req.params.id).then(() => res.status(204).end());
							else
								res.status(403).json({ "Error": "The " + kind + " is owned by someone else" });
						} else
							res.status(404).json({ "Error": "No " + kind + " with this " + kind + "_id exists" });
					});
				} else
					res.status(401).json({ "Error": "The user token is invalid" });
			});
		} catch (err) {
			console.log(err);
			// handle jwt-decode error
			res.status(401).json({ "Error": "The user token is invalid" });
		}
	}
});

// boat arrives at a slip
router.put('/slips/:slipID/:boatID', function (req, res) {
	// call the model GET function to make sure it exists
	var full = false;
	const boatSide = new Promise(function (resolve, reject) {
		resolve(model.getItem(BOAT, req.params.boatID, req) !== undefined);
	});
	const slipSide = new Promise(function (resolve, reject) {
		model.getItem(SLIP, req.params.slipID, req).then((item) => {
			// check if it is already full
			if (item !== undefined) {
				if (item.current_boat)
					full = true;
				resolve(true);
			} else
				resolve(false);
		});
	});
	Promise.all([boatSide, slipSide]).then(result => {
		if (result[0] && result[1]) {
			// check if there is already a boat at the slip
			if (!full) {
				model.slipless(req.params.boatID).then(slipStatus => {
					if (slipStatus == true)
						model.arrive(req.params.slipID, req.params.boatID).then(() => res.status(204).end());
					else
						res.status(403).json({ "Error": "The boat is already at slip" + slipstatus });
				});
			}
			else
				res.status(403).json({ "Error": "The slip is not empty" });
		} else {
			// boat and/or slip don't exist
			res.status(404).json({ "Error": "The specified boat and/or slip don\u2019t exist" });
		}
	})
});

// boat departs from a slip
router.delete('/slips/:slipID/:boatID', function (req, res) {
	// call the model GET function to make sure it exists
	var correctBoat = false;
	const boatSide = new Promise(function (resolve, reject) {
		resolve(model.getItem(BOAT, req.params.boatID, req) !== undefined);
	});
	const slipSide = new Promise(function (resolve, reject) {
		model.getItem(SLIP, req.params.slipID, req).then((item) => {
			// check if the the correct boat is at the slip
			if (item !== undefined) {
				if (item.current_boat == req.params.boatID)
					correctBoat = true;
				resolve(true);
			} else
				resolve(false);
		});
	});
	Promise.all([boatSide, slipSide]).then(result => {
		if (result[0] && result[1]) {
			// boat departs only if the correct boat is at the slip
			if (correctBoat)
				model.depart(req.params.slipID).then(() => res.status(204).end());
			else
				res.status(404).json({ "Error": "No boat with this boatID is at the slip with this slipID" });
		} else {
			// boat and/or slip don't exist
			res.status(404).json({ "Error": "The specified boat and/or slip don\u2019t exist" });
		}
	})
});

// view all loads for a given boat
router.get('/boats/:boatID/loads', function (req, res) {
	const accepts = req.accepts(['application/json', 'text/html']);
	var jwt = req.get("authorization");
	const kind = BOAT;

	// request accept type not supported
	if (!accepts)
		res.status(406).json({ "Error": "The Accept type is not supported by this endpoint" });
	else if (!jwt)
		res.status(401).json({ "Error": "The user token is missing" });
	else if (jwt.split(" ")[0] != "Bearer")
		res.status(401).json({ "Error": "The user token is invalid" });
	else {
		// if user token is provided
		jwt = jwt.split(" ")[1];
		var sub;
		try {
			sub = jwtDecode(jwt).sub;
			// check for user ID
			model.getUserID(USER, sub).then(userID => {
				if (userID) {
					model.getItem(BOAT, req.params.boatID, req).then((item) => {
						// make sure the boat exists
						if (item) {
							if (item.owner == sub)
								model.getLoadList(item, req).then(loadList => res.status(200).json(loadList));
							else
								res.status(403).json({ "Error": "The " + kind + " is owned by someone else" });
						} else
							res.status(404).json({ "Error": "No " + kind + " with this " + kind + "_id exists" });
					});
				} else
					res.status(401).json({ "Error": "The user token is invalid" });
			});
		} catch (err) {
			console.log(err);
			// handle jwt-decode error
			res.status(401).json({ "Error": "The user token is invalid" });
		}
	}
});

// assign load to a boat
router.put('/boats/:boatID/loads/:loadID', function (req, res) {
	var jwt = req.get("authorization");
	var hasCarrier = false;

	if (!jwt)
		res.status(401).json({ "Error": "The user token is missing" });
	else if (jwt.split(" ")[0] != "Bearer")
		res.status(401).json({ "Error": "The user token is invalid" });
	else {
		// if user token is provided
		jwt = jwt.split(" ")[1];
		var sub;
		try {
			sub = jwtDecode(jwt).sub;
			// check for user ID
			model.getUserID(USER, sub).then(userID => {
				if (userID) {
					var thisBoat;
					// call the model GET function to make sure it exists
					const boatSide = new Promise(function (resolve, reject) {
						model.getItem(BOAT, req.params.boatID, req).then(item => {
							thisBoat = item;
							resolve(item !== undefined);
						});
					});
					const loadSide = new Promise(function (resolve, reject) {
						model.getItem(LOAD, req.params.loadID, req).then((item) => {
							// check if the the load does not already have a carrier
							if (item !== undefined) {
								model.getItem(LOAD, req.params.loadID, req).then(result => {
									if (result.carrier)
										hasCarrier = true;
									resolve(true);
								});
							} else
								resolve(false);
						});
					});
					Promise.all([boatSide, loadSide]).then(result => {
						if (result[0] && result[1]) {
							if (thisBoat.owner == sub) {
								// assign the load only if it does not already have a carrier
								if (!hasCarrier) {
									model.assignLoad(req.params.boatID, req.params.loadID, req).then(() => res.status(204).end());
								}
								else
									res.status(403).json({ "Error": "The load already has a carrier" });
							} else
								res.status(403).json({ "Error": "The boat is owned by someone else" });
						} else
							// boat and/or load don't exist
							res.status(404).json({ "Error": "The specified boat and/or load don\u2019t exist" });
					});
				} else
					res.status(401).json({ "Error": "The user token is invalid" });
			});
		} catch (err) {
			console.log(err);
			// handle jwt-decode error
			res.status(401).json({ "Error": "The user token is invalid" });
		}
	}
});

// unload a load from a boat
router.delete('/boats/:boatID/loads/:loadID', function (req, res) {
	var jwt = req.get("authorization");
	var loadIndex;

	if (!jwt)
		res.status(401).json({ "Error": "The user token is missing" });
	else if (jwt.split(" ")[0] != "Bearer")
		res.status(401).json({ "Error": "The user token is invalid" });
	else {
		// if user token is provided
		jwt = jwt.split(" ")[1];
		var sub;
		try {
			sub = jwtDecode(jwt).sub;
			// check for user ID
			model.getUserID(USER, sub).then(userID => {
				if (userID) {
					var thisBoat;
					// call the model GET function to make sure it exists
					const boatSide = new Promise(function (resolve, reject) {
						model.getItem(BOAT, req.params.boatID, req).then(item => {
							thisBoat = item;
							resolve(item !== undefined);
						});
					});
					const loadSide = new Promise(function (resolve, reject) {
						model.getItem(LOAD, req.params.loadID, req).then((item) => {
							// check if the the load is on the boat
							if (item !== undefined) {
								model.getLoadIndex(req.params.boatID, req.params.loadID).then(result => {
									loadIndex = result;
									resolve(true);
								});
							} else
								resolve(false);
						});
					});
					Promise.all([boatSide, loadSide]).then(result => {
						if (result[0] && result[1]) {
							if (thisBoat.owner == sub) {
								// unload the load only if it is loaded on the boat
								if (loadIndex !== undefined && loadIndex !== false)
									model.unload(req.params.boatID, loadIndex).then(() => res.status(204).end());
								else
									res.status(404).json({ "Error": "No load with this loadID is on the boat with this boatID" });
							} else
								res.status(403).json({ "Error": "The boat is owned by someone else" });
						} else
							// boat and/or load don't exist
							res.status(404).json({ "Error": "The specified boat and/or load don\u2019t exist" });
					});
				} else
					res.status(401).json({ "Error": "The user token is invalid" });
			});
		} catch (err) {
			console.log(err);
			// handle jwt-decode error
			res.status(401).json({ "Error": "The user token is invalid" });
		}
	}
});


app.use('/', router);

// Listen to the App Engine-specified port, or 8080 otherwise
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
	console.log(`Server listening on port ${PORT}...`);
});
