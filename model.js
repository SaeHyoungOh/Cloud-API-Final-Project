/******************************************************************************
* Program Name:		Portfolio Assignment: Final Project
* Author:			Sae Hyoung Oh
* Last Modified:	6/1/2020
* Description:
*	This is model functions portion of the API. It uses Google Cloud Datastore
*	as database. These functions are called by the controllers in server.js.
******************************************************************************/

// keys for google auth
const keys = require('./keys.js');

// google cloud datastore
const { Datastore } = require('@google-cloud/datastore');
const datastore = new Datastore();
// google auth api
const { google } = require('googleapis');
const oauth2Client = new google.auth.OAuth2(
	keys.client_id,
	keys.client_secret,
	keys.redirect_uri[1]	// change this for live
);

const json2html = require('json-to-html');
const axios = require("axios");
var jwtDecode = require('jwt-decode');

const BOAT = "boat";
const SLIP = "slip";
const LOAD = "load";
const USER = "user";
const pageSize = 5;


// random string generator
// reference: https://stackoverflow.com/questions/1349404/generate-random-string-characters-in-javascript
const randomString = function (length) {
	return new Promise((resolve, reject) => {
		var result = '';
		var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		var charactersLength = characters.length;
		for (var i = 0; i < length; i++) {
			result += characters.charAt(Math.floor(Math.random() * charactersLength));
		}
		resolve(result);
	});
};

// get url to google auth
const googleURL = function () {
	return new Promise((resolve, reject) => {
		var state;
		// generate a state string
		randomString(10).then(result => {
			state = result;
			const q = datastore.createQuery("state");
			return datastore.runQuery(q);
		}).then(entities => {
			if (entities[0][0] === undefined) {
				// create new entity for state
				const key = datastore.key("state");
				const attributes = { "state": state };
				const newObject = { "key": key, "data": attributes };
				return datastore.save(newObject);
			} else {
				// update state if it exists
				const key = datastore.key(["state", parseInt(fromDatastore(entities[0][0]).id, 10)]);
				const attributes = { "state": state };
				const updateObject = { "key": key, "data": attributes };
				return datastore.update(updateObject);
			}
		}).then(() => {
			// generate the url
			return oauth2Client.generateAuthUrl({
				response_type: "code",
				scope: "profile",
				state: state
			});
		}).then(url => {
			resolve(url);
		});
	});
};

// get access token from authorization code
const getToken = function (req) {
	return new Promise((resolve, reject) => {
		var context = {};
		var state;
		// verify that the state sent matches the state received
		const q = datastore.createQuery("state");
		datastore.runQuery(q).then(entities => {
			state = entities[0][0].state;
			if (state != req.query.state) {
				context.stateError = true;
				resolve(context);
			} else {
				// exchange authorization code for access token
				oauth2Client.getToken(req.query.code).then(result => {
					oauth2Client.setCredentials(result.tokens)
				}).then(() => {
					const jwt = oauth2Client.credentials.id_token;
					const jwtDecoded = jwtDecode(jwt)
					// save the sub in datastore
					getUserID(USER, jwtDecoded.sub).then(userID => {
						if (userID) {
							// update if user exists
							const key = datastore.key([USER, parseInt(userID, 10)]);
							datastore.get(key).then(entities => {
								const attributes = { "sub": jwtDecoded.sub, "given_name": jwtDecoded.given_name, "family_name": jwtDecoded.family_name, "boats": entities[0].boats };
								const updateObject = { "key": key, "data": attributes };
								return updateObject;
							}).then(updateObject => datastore.update(updateObject));
						} else {
							// create new if it does not exist
							const key = datastore.key(USER);
							const attributes = { "sub": jwtDecoded.sub, "given_name": jwtDecoded.given_name, "family_name": jwtDecoded.family_name, "boats": [] };
							const newObject = { "key": key, "data": attributes };
							datastore.save(newObject);
						}
						resolve({ "jwt": jwt, "state": state });
					});
				});
			}
		});
	});
};

// get user data from token
const getUserData = function (data) {
	return new Promise((resolve, reject) => {
		// get the user info with the token
		const dataURL = "https://people.googleapis.com/v1/people/me?personFields=names,emailAddresses";
		const header = {
			headers: { Authorization: "Bearer " + oauth2Client.credentials.access_token }
		}
		axios.get(dataURL, header).then(response => {
			// display the result on the page
			var context = {};
			const decoded = jwtDecode(data.jwt);

			context.fname = response.data.names[0].givenName;
			context.lname = response.data.names[0].familyName;
			context.state = data.state;
			context.jwt = data.jwt;
			context.jwtDecoded = JSON.stringify(decoded, undefined, 4);
			context.userID = decoded.sub;

			resolve(context);
		}).catch(error => {
			resolve(error);
		});
	});
};

// helper function to determine the kind
function getKind(req) {
	var kind;

	if (req.params.kind == "boats") kind = BOAT;
	else if (req.params.kind == "slips") kind = SLIP;
	else if (req.params.kind == "loads") kind = LOAD;
	else if (req.params.kind == "users") kind = USER;

	return kind;
}

// helper function to determine if the arguments are provided
function argsProvided(kind, req) {
	var arg = true;

	if (kind == BOAT) {
		if (!req.body.name) arg = false;
		if (!req.body.type) arg = false;
		if (!req.body.length) arg = false;
	}
	// if PATCH /slips
	else if (kind == SLIP) {
		if (!req.body.number) arg = false;
	}
	// if PATCH /loads
	else if (kind == LOAD) {
		if (!req.body.weight) arg = false;
		if (!req.body.content) arg = false;
		if (!req.body.delivery_date) arg = false;
	}

	return arg;
}

// helper function to determine if the attribute is unique
const isUnique = function (kind, attribute, value) {
	return new Promise((resolve, reject) => {
		const q = datastore.createQuery(kind).filter(attribute, "=", value);
		datastore.runQuery(q)
		.then(result => {
			if (result[0] !== undefined && result[0].length > 0)
				resolve(false);
			else
				resolve(true);
		});
	});
};

// helper function for input validation - string
const stringCheck = function (str, attr, res) {
	return new Promise((resolve, reject) => {
		// check for the length of the name
		if (str.length > 32) {
			res.status(400).json({ "Error": "The " + attr + " is too long" });
			resolve(false);
		}
		if (str.length < 2) {
			res.status(400).json({ "Error": "The " + attr + " is too short" });
			resolve(false);
		}
		// check for valid characters for name (alphanumeric and space and some special characters)
		// reference: https://stackoverflow.com/questions/17439917/regex-to-accept-alphanumeric-and-some-special-character-in-javascript
		if (!str.match(/^[ A-Za-z0-9_@./#&+-]*$/)) {
			res.status(400).json({ "Error": "The request object has invalid character(s) in " + attr + " attribute" });
			resolve(false);
		}
		resolve(true);
	});
};

// helper function for input validation - positive number
const positiveNumberCheck = function (num, attr, res) {
	return new Promise((resolve, reject) => {
		if (typeof num != "number") {
			res.status(400).json({ "Error": "The request object's " + attr + " attribute is not a number" });
			resolve(false);
		}
		if (num <= 0) {
			res.status(400).json({ "Error": "The request object's " + attr + " cannot be zero or negative" });
			resolve(false);
		}
		if (num > 65535) {
			res.status(400).json({ "Error": "The request object's " + attr + " is too long" });
			resolve(false);
		}
		resolve(true);
	});
};

// helper function to check all the inputs of boat
const inputCheckBoat = function (kind, req, res) {
	return new Promise((resolve, reject) => {
		// string check name
		const promiseName = new Promise((resolve, reject) => {
			if (req.body.name) {
				isUnique(kind, "name", req.body.name).then(isUniqueResult => {
					return { "isUnique": isUniqueResult, "stringCheck": stringCheck(req.body.name, "name", res) };
				}).then((result) => {
					// check if the name is unique
					if (!result["isUnique"]) {
						res.status(403).json({ "Error": "The name is already in use" });
						resolve(false);
					} else resolve(result["stringCheck"]);
				});
			} else resolve(true);
		});
		// string check type
		const promiseType = new Promise((resolve, reject) => {
			if (req.body.type) {
				resolve(stringCheck(req.body.type, "type", res));
			} else resolve(true);
		});
		// check for valid length
		const promiseLength = new Promise((resolve, reject) => {
			if (req.body.length) {
				resolve(positiveNumberCheck(req.body.length, "length", res));
			} else resolve(true);
		});
		Promise.all([promiseName, promiseType, promiseLength]).then(p => {
			if (p[0] == true && p[1] == true && p[2] == true) {
				resolve(true);
			}
		});
	});
};

// helper function to check all the inputs of load
const inputCheckLoad = function (kind, req, res) {
	return new Promise((resolve, reject) => {
		// number check weight
		const promiseWeight = new Promise((resolve, reject) => {
			if (req.body.weight) {
				resolve(positiveNumberCheck(req.body.weight, "weight", res));
			} else resolve(true);
		});
		// string check content
		const promiseContent = new Promise((resolve, reject) => {
			if (req.body.content) {
				resolve(stringCheck(req.body.content, "content", res));
			} else resolve(true);
		});
		// check for valid delivery date
		const promiseDeliveryDate = new Promise((resolve, reject) => {
			if (req.body.delivery_date) {
				resolve(stringCheck(req.body.delivery_date, "delivery_date", res));
			} else resolve(true);
		});
		Promise.all([promiseWeight, promiseContent, promiseDeliveryDate]).then(p => {
			if (p[0] == true && p[1] == true && p[2] == true) {
				resolve(true);
			}
		});
	});
};

// helper function to check all the inputs
const inputCheck = function (kind, req, res) {
	return new Promise((resolve, reject) => {
		if (kind == BOAT) {
			resolve(inputCheckBoat(kind, req, res));
		} else if (kind == LOAD) {
			resolve(inputCheckLoad(kind, req, res));
		}
	});
};

// helper function to convert JSON to HTML and then to format it
function toHTML(item) {
	return json2html(item).replace(/\{/g, '').replace(/\}/g, '').replace(/\[/g, '').replace(/\]/g, '').replace(/\,/g, '');
}

// helper function to get id of an item from datastore
function fromDatastore(item) {
	item.id = item[Datastore.KEY].id;
	return item;
}

// helper function to add URL to an item
function addURL(item, req, kindPlural) {
	if (kindPlural == "users")
		item.self = req.protocol + '://' + req.get('host') + '/' + kindPlural + '/' + item.sub;
	else
		item.self = req.protocol + '://' + req.get('host') + '/' + kindPlural + '/' + item.id;
	return item;
}

// add an item
function newItem(kind, req) {
	var key = datastore.key(kind);
	var attributes;
	// set attributes according to the kind
	if (kind == BOAT) {
		const userID = jwtDecode(req.get("authorization").split(" ")[1]).sub;
		attributes = { "name": req.body.name, "type": req.body.type, "length": req.body.length, "owner": userID, "loads": [] };
	} else if (kind == SLIP) {
		attributes = { "number": req.body.number, "current_boat": null };
	} else if (kind == LOAD) {
		attributes = { "weight": req.body.weight, "content": req.body.content, "delivery_date": req.body.delivery_date };
	}
	// build the datastore object and save
	var newObject = { "key": key, "data": attributes };
	return datastore.save(newObject)
		.then(() => getItem(kind, newObject.key.id, req))
		.then(createdItem => {
			// if boat, add it to the user
			if (kind == BOAT) {
				return getUserID(USER, attributes.owner)
					.then(userID => addBoat(userID, createdItem.id))
					.then(() => { return createdItem; });
			} else
				return createdItem;
		});
}

// modify selected attributes of an item
const patchItem = function (kind, id, req, original) {
	return new Promise((resolve, reject) => {
		const key = datastore.key([kind, parseInt(id, 10)]);
		// build the datastore object from the boat id
		var attributes = {};
		// set attributes according to the kind
		if (kind == BOAT) {
			attributes.name = req.body.name ? req.body.name : original.name;
			attributes.type = req.body.type ? req.body.type : original.type;
			attributes.length = req.body.length ? req.body.length : original.length;
			attributes.owner = req.body.owner ? req.body.owner : original.owner;
			attributes.loads = req.body.loads ? req.body.loads : original.loads;
		}
		else if (kind == SLIP) {
			attributes.number = req.body.number ? req.body.number : original.number;
		}
		else if (kind == LOAD) {
			attributes.weight = req.body.weight ? req.body.weight : original.weight;
			attributes.content = req.body.content ? req.body.content : original.content;
			attributes.delivery_date = req.body.delivery_date ? req.body.delivery_date : original.delivery_date;
			attributes.carrier = req.body.carrier ? req.body.carrier : original.carrier;
		}

		const updatedObject = { "key": key, "data": attributes };

		// update the entity with the object and return it
		datastore.update(updatedObject).then(() => resolve(getItem(kind, id, req)));
	});
};

// modify all attributes of an item
const putItem = function (kind, id, req, original) {
	return new Promise((resolve, reject) => {
		const key = datastore.key([kind, parseInt(id, 10)]);
		// build the datastore object from the boat id
		var attributes = {};
		// set attributes according to the kind
		if (kind == BOAT) {
			attributes = { "name": req.body.name, "type": req.body.type, "length": req.body.length, "owner": original.owner, "loads": original.loads };
		}
		else if (kind == SLIP) {
			attributes = { "number": req.body.number, "current_boat": original.current_boat };
		}
		else if (kind == LOAD) {
			attributes = { "weight": req.body.weight, "carrier": original.carrier, "content": req.body.content, "delivery_date": req.body.delivery_date };
		}

		const updatedObject = { "key": key, "data": attributes };

		// update the entity with the object and return it
		datastore.update(updatedObject).then(() => resolve(getItem(kind, id, req)));
	});
};

// get all items of a kind without pagination
function getAllItems(kind, req) {
	const q = datastore.createQuery(kind);
	return datastore.runQuery(q).then(entities => {
		if (entities[0] !== undefined && entities[0].length > 0)
			return entities[0].map(item => addURL(fromDatastore(item), req, req.params.kind));
		else if (entities[0] !== undefined && entities[0].length == 0)
			return [];
	});
}

// get all items of a kind with pagination
async function getAllItemsPagination(kind, req, cursor, userID) {
	var results = {};

	// get the number of items first
	var q = datastore.createQuery(kind);
	results.count = await datastore.runQuery(q).then(entities => { return entities[0].length; });

	// set the limit to 3 per page and re-query to datastore
	var query = datastore.createQuery(kind).limit(pageSize);
	// add cursor to the result
	if (cursor) {
		query = query.start(cursor);
	}
	// build the object and return it
	const queryResults = await datastore.runQuery(query);
	var entities = queryResults[0];
	const info = queryResults[1];
	// if there is more result, add the link to next page
	if (info.moreResults !== Datastore.NO_MORE_RESULTS) {
		results.next = req.protocol + "://" + req.get("host") + '/' + req.params.kind + "?cursor=" + info.endCursor;
	}

	// remove boats not belonging to the user
	var boatsList = [];
	if (kind == BOAT) {
		results.count = 0;
		for (var i = 0; i < entities.length; i++) {
			if (entities[i].owner == userID) {
				boatsList.push(entities[i]);
				results.count++;
			}
		}
		entities = boatsList;
	}

	// build the self URL for each item and loads or carrier of each
	results.items = entities.map(item => {
		if (kind == BOAT) {
			// if boat, return only the boats owned by the user
			if (item.owner == userID) {
				// if boat, build self URL also for the loads
				if (item.loads !== undefined && item.loads.length > 0) {
					item = addURL(fromDatastore(item), req, req.params.kind)
					item.loads = item.loads.map(loadItem => addURL(loadItem, req, "loads"));
					return item;
				} else {
					item.loads = [];
					return addURL(fromDatastore(item), req, req.params.kind);
				}
			}
		} else if (kind == LOAD) {
			// if load, build self URL also for the carrier
			if (item.carrier) {
				item = addURL(fromDatastore(item), req, req.params.kind);
				item.carrier = addURL(item.carrier, req, "boats");
				return item;
			} else {
				return addURL(fromDatastore(item), req, req.params.kind);
			}
		} else if (kind == USER) {
			// if user, build self URL also for the boats
			if (item.boats !== undefined && item.boats.length > 0) {
				item = addURL(fromDatastore(item), req, req.params.kind)
				item.boats = item.boats.map(loadItem => addURL(loadItem, req, "boats"));
				return item;
			} else {
				return addURL(fromDatastore(item), req, req.params.kind);
			}
		}
	});

	return results;
}

// get one item
function getItem(kind, id, req) {
	if (kind != USER) {
		const key = datastore.key([kind, parseInt(id, 10)]);
		return datastore.get(key).then(entities => {
			// build the self URL for each item and loads or carrier of each
			if (entities[0] !== undefined) {
				if (kind == BOAT) {
					// if boat, build self URL also for the loads
					if (entities[0].loads !== undefined && entities[0].loads.length > 0) {
						item = addURL(fromDatastore(entities[0]), req, "boats")
						item.loads = item.loads.map(loadItem => addURL(loadItem, req, "loads"));
						return item;
					} else
						return addURL(fromDatastore(entities[0]), req, "boats");
				} else if (kind == LOAD) {
					// if load, build self URL also for the carrier
					if (entities[0].carrier) {
						item = addURL(fromDatastore(entities[0]), req, "loads");
						item.carrier = addURL(item.carrier, req, "boats");
						return item;
					} else {
						return addURL(fromDatastore(entities[0]), req, "loads");
					}
				}
			}
		});
	} else {
		return getUserID(kind, id)
			.then(userID => datastore.key([kind, parseInt(userID, 10)]))
			.then(key => datastore.get(key))
			.then(entities => {
			// if user, build self URL also for the boats
			if (entities[0].boats !== undefined && entities[0].boats.length > 0) {
				item = addURL(fromDatastore(entities[0]), req, "users")
				item.boats = item.boats.map(boatItem => addURL(boatItem, req, "boats"));
				return item;
			} else
				return addURL(fromDatastore(entities[0]), req, "users");
		});
	}
}

// delete one item
const deleteItem = function (kind, id) {
	return new Promise((resolve, reject) => {
		const key = datastore.key([kind, parseInt(id, 10)]);
		if (kind == BOAT) {
			// if it is a boat, check if it is at a slip
			const qSlip = datastore.createQuery(SLIP).filter("current_boat", "=", id);
			datastore.runQuery(qSlip)
			.then(qResult => {
				// if boat is at a slip, depart
				if (qResult[0] !== undefined && qResult[0].length > 0)
					return depart(qResult[0][0][Datastore.KEY].id);
			})
			// remove the boat from the user
			.then(() => datastore.get(key))							// get the boat
			.then(entities => getUserID(USER, (entities[0].owner)))	// get the user ID from sub
			.then(userID => removeBoat(userID, id))					// remove boat from user
			.then(() => datastore.delete(key))						// delete the boat

			// also check if any loads are loaded onto it
			.then(() => {
				const qLoad = datastore.createQuery(LOAD).filter("carrier.id", "=", id);
				return datastore.runQuery(qLoad);
			})
			// unload all and return
			.then(qResult => resolve(qResult[0].map(item => removeCarrier(item[Datastore.KEY].id))));
		} else if (kind == LOAD) {
			// if it is a load, check if it is loaded anywhere
			datastore.get(key).then(entities => {
				if (entities[0].carrier) {
					getLoadIndex(entities[0].carrier.id, id)
					// if the boat exists, unload it from the boat
					.then(loadIndex => {
						if (loadIndex)
							unload(entities[0].carrier.id, loadIndex)
					// then delete
					}).then(() => resolve(datastore.delete(key)));
				} else {
					resolve(datastore.delete(key));
				}
			});
		} else if (kind == USER) {
			// if it is a user, check if it has any boats
			const qBoat = datastore.createQuery(BOAT).filter("user", "=", id);
			return datastore.runQuery(qBoat)
			.then(qResult => {
				if (qResult[0] != undefined && qResult[0].length > 0) {
					return qResult[0].map(item => deleteItem(BOAT, item.id));
				}
			}).then(() => {
			// delete the user
			resolve(datastore.delete(key));
			})
		} else {
			// all the other items can be simply deleted
			resolve(datastore.delete(key));
		}
	});
};

// delete all items of a kind (for development use only)
const deleteAllItems = function (kind, req) {
	return new Promise((resolve, reject) => {
		getAllItems(kind, req)
		.then(items => {
			if (items !== undefined && items.length > 0)
				resolve(items.map(item => deleteItem(kind, item.id)));
			else resolve();
		});
	});
};

// boat arrives at a slip
const arrive = function (slipID, boatID) {
	return new Promise((resolve, reject) => {
		const key = datastore.key([SLIP, parseInt(slipID, 10)]);
		// build the datastore object from the slip id
		datastore.get(key)
		.then(entities => {
			const attributes = { "number": entities[0].number, "current_boat": boatID };
			return { "key": key, "data": attributes };
		})
		// update the slip
		.then(new_item => resolve(datastore.update(new_item)));
	});
};

// check if the boat is already at a slip
const slipless = function (id) {
	return new Promise((resolve, reject) => {
		const q = datastore.createQuery(SLIP).filter("current_boat", "=", id);
		datastore.runQuery(q)
		.then(entities => {
			// if boat is at a slip
			if (entities[0] !== undefined && entities[0].length > 0)
				resolve(entities[0][0][Datastore.KEY].id);
			// if not at any slips
			else
				resolve(true);
		});
	});
};

// boat departs from a slip
const depart = function (slipID) {
	return new Promise((resolve, reject) => {
		const key = datastore.key([SLIP, parseInt(slipID, 10)]);
		// build the datastore object from the slip id
		datastore.get(key)
		.then(entities => {
			const attributes = { "number": entities[0].number, "current_boat": null };
			return { "key": key, "data": attributes };
		})
		// update the slip
		.then(new_item => resolve(datastore.update(new_item)));
	});
};

// assign load to a boat
const assignLoad = function (boatID, loadID, req) {
	return new Promise((resolve, reject) => {
		var thisBoat;
		const boatKey = datastore.key([BOAT, parseInt(boatID, 10)]);
		const loadKey = datastore.key([LOAD, parseInt(loadID, 10)]);
		// build the datastore object from the boat id
		datastore.get(boatKey)
		.then(boatEntities => {
			// variables to be used in load entity
			thisBoat = fromDatastore(boatEntities[0]);
			var attributes = { "name": boatEntities[0].name, "type": boatEntities[0].type, "length": boatEntities[0].length, "owner": boatEntities[0].owner, "loads": boatEntities[0].loads };
			// add the load to the object
			attributes.loads.push({ "id": loadID });
			return { "key": boatKey, "data": attributes };
		})
		// update the boat with the object
		.then(updatedBoat => datastore.update(updatedBoat))

		// build the datastore object from the load id
		.then(() => datastore.get(loadKey))
		.then(loadEntities => {
			var attributes = { "weight": loadEntities[0].weight, "content": loadEntities[0].content, "delivery_date": loadEntities[0].delivery_date };
			// add the carrier to the object
			attributes.carrier = { "id": thisBoat.id, "name": thisBoat.name };
			return { "key": loadKey, "data": attributes };
		})
		// update the load with the object
		.then(updatedLoad => resolve(datastore.update(updatedLoad)));
	});
};

// get the index of the load in the boat
const getLoadIndex = function (boatID, loadID) {
	return new Promise((resolve, reject) => {
		const boatKey = datastore.key([BOAT, parseInt(boatID, 10)]);
		// get the boat
		datastore.get(boatKey).then(entities => {
			if (entities[0] !== undefined) {
				var loadIndex;
				// find the load in the boat
				entities[0].loads.find((item, index) => {
					if (item.id == loadID) {
						loadIndex = index;
					}
				});
				resolve(loadIndex);
			} else {
				resolve(false);
			}
		});
	});
};

// unload a load from a boat 
const unload = function (boatID, loadIndex) {
	return new Promise((resolve, reject) => {
		var loadID;
		const boatKey = datastore.key([BOAT, parseInt(boatID, 10)]);
		// build the datastore object from the boat id
		datastore.get(boatKey).then(boatEntities => {
			loadID = boatEntities[0].loads[loadIndex].id;
			var attributes = { "name": boatEntities[0].name, "type": boatEntities[0].type, "length": boatEntities[0].length, "owner": boatEntities[0].owner, "loads": boatEntities[0].loads };
			// remove the load from the object
			attributes.loads.splice(loadIndex, 1);
			return { "key": boatKey, "data": attributes };
		})
		// update the boat with the object
		.then(updatedBoat => datastore.update(updatedBoat))
		// remove the carrier from the load
		.then(() => resolve(removeCarrier(loadID)));
	});
};

// remove the carrier from the load
const removeCarrier = function (loadID) {
	return new Promise((resolve, reject) => {
		const loadKey = datastore.key([LOAD, parseInt(loadID, 10)]);
		datastore.get(loadKey)
		.then(entities => {
			if (entities[0] !== undefined) {
				var attributes = { "weight": entities[0].weight, "content": entities[0].content, "delivery_date": entities[0].delivery_date };
				return { "key": loadKey, "data": attributes };
			}
		})
		// update the boat with the object
		.then(updatedLoad => resolve(datastore.update(updatedLoad)));
	});
};

// get the list of loads from a boat
const getLoadList = async function (boatItem, req) {
	return new Promise((resolve, reject) => {
		// turn map into a promise because it is not ".then"-able.
		// reference: https://stackoverflow.com/questions/39452083/using-promise-function-inside-javascript-array-map
		const itemsPromise = boatItem.loads.map(loadItem => getItem(LOAD, loadItem.id, req));
		Promise.all(itemsPromise).then(items => {
			var loadList = {};
			// get the list of all the loads on the boat and return it
			loadList.items = items;
			for (let i = 0; i < loadList.items.length; i++) {
				delete loadList.items[i].carrier;
			}
			loadList.count = loadList.items.length;
			resolve(loadList);
		});
	});
};

// get the id of the user from the sub
const getUserID = function (kind, sub) {
	return new Promise((resolve, reject) => {
		if (kind == USER && sub) {
			const q = datastore.createQuery(USER).filter("sub", "=", sub);
			datastore.runQuery(q).then(result => {
				if (result[0] !== undefined && result[0].length > 0) {
					resolve(fromDatastore(result[0][0]).id);
				} else
					resolve(false);
			});
		}
		else resolve(sub);
	});
};

// add boat to user and user to boat
const addBoat = function (userID, boatID) {
	return new Promise((resolve, reject) => {
		var thisUser;
		const userKey = datastore.key([USER, parseInt(userID, 10)]);
		const boatKey = datastore.key([BOAT, parseInt(boatID, 10)]);
		// build the datastore object from the user id
		datastore.get(userKey)
		.then(userEntities => {
			// variables to be used in boat entity
			thisUser = fromDatastore(userEntities[0]);
			var attributes = { "sub": userEntities[0].sub, "given_name": userEntities[0].given_name, "family_name": userEntities[0].family_name };
			// add the boat to the object
			if (userEntities[0].boats !== undefined && userEntities[0].boats.length > 0)
				attributes.boats = userEntities[0].boats;
			else
				attributes.boats = [];
			attributes.boats.push({ "id": boatID });
			return { "key": userKey, "data": attributes };
		})
		// update the user with the object
		.then(updatedUser => datastore.update(updatedUser))

		// build the datastore object from the boat id
		.then(() => datastore.get(boatKey))
		.then(boatEntities => {
			var attributes = { "name": boatEntities[0].name, "type": boatEntities[0].type, "length": boatEntities[0].length, "owner": boatEntities[0].owner, "loads": boatEntities[0].loads };
			// add the user to the object
			attributes.owner = thisUser.sub;
			return { "key": boatKey, "data": attributes };
		})
		// update the boat with the object
		.then(updatedBoat => resolve(datastore.update(updatedBoat)));
	});
};

// remove boat from user
const removeBoat = function (userID, boatID) {
	return new Promise((resolve, reject) => {
		const userKey = datastore.key([USER, parseInt(userID, 10)]);
		// build the datastore object from the user id
		datastore.get(userKey).then(userEntities => {
			var attributes = { "sub": userEntities[0].sub, "given_name": userEntities[0].given_name, "family_name": userEntities[0].family_name };

			// find the boat in the user
			var boatIndex;
			if (userEntities[0].boats !== undefined && userEntities[0].boats.length > 0) {
				attributes.boats = userEntities[0].boats;
				attributes.boats.find((item, index) => {
					if (item.id == boatID) {
						boatIndex = index;
					}
				});
			} else
				attributes.boats = [];

			// remove the boat from the object
			attributes.boats.splice(boatIndex, 1);
			return { "key": userKey, "data": attributes };

		// update the user with the object
		}).then(updatedUser => resolve(datastore.update(updatedUser)));
		
	});
};


// for use in other files
module.exports = {
	googleURL,
	getToken,
	getUserData,
	getKind,
	argsProvided,
	isUnique,
	stringCheck,
	positiveNumberCheck,
	inputCheck,
	toHTML,
	fromDatastore,
	newItem,
	patchItem,
	putItem,
	getAllItems,
	getAllItemsPagination,
	getItem,
	deleteItem,
	deleteAllItems,
	arrive,
	slipless,
	depart,
	assignLoad,
	getLoadIndex,
	unload,
	getLoadList,
	getUserID
};
