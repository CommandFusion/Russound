/*  Russound module for CommandFusion
===============================================================================

AUTHOR:		Jarrod Bell, CommandFusion
CONTACT:	support@commandfusion.com
URL:		https://github.com/CommandFusion/Russound
VERSION:	v0.0.2
LAST MOD:	11 June 2011

=========================================================================
HELP:

DIGITAL JOINS:
1 = Zone Power
2 = Zone Mute
3 = Zone DND
4 = Zone Party Mode
5 = Zone Party Mode MASTER
6 = Zone Shared
7 = Zone Loudness

10 = Source List
11 = Source Shuffle

SERIAL JOINS:
1 = Zone Name
2 = Zone Volume Level
3 = Zone Source Name

ANALOG JOINS:
1 = Zone Volume Level

LIST JOINS:
1 = Zone List
2 = Source List

=========================================================================
*/

// ======================================================================
// Log Function - for use with Remote Debugger (in iViewer Settings)
// ======================================================================

function LOG_RUSSOUND() {
	if (CF.debug) {
		var s = "RUSSOUND: ";
		for (var i=0; i < arguments.length; i++) {
			s += arguments[i].toString();
		}
		CF.log(s);
	}
};

// ======================================================================
// Global Object - Instantiate as many as needed (1 per 48 zone system)
// ======================================================================

var Russound = function(systemName, feedbackName) {

	var self = {
		zoneList: 			"l1",
		sourceList: 		"l2",
		currentZone:		0,
		currentSource:		0,

		// array of each zone
		zones: {
			c1: [],
			c2: [],
			c3: [],
			c4: [],
			c5: [],
			c6: []
		},

		// array of each source
		sources: [],

		// controller object
		controller: {
			ipAddress: "",
			macAddress: "",
			status: 0,
			version: "",
			numZones: 48,
			numSources: 8
		},

		// regex for parsing various incoming data
		controllerRegex:	/(.*?) C\[(\d*)\].(.*?)=\"(.*)\"/i,				// Example: COMMAND C[1].key=value
		zoneRegex:			/(.*?) C\[(\d*)\].Z\[(\d*)\].(.*?)=\"(.*)\"/i,	// Example: COMMAND C[1].Z[1].key=value
		sourceRegex:		/(.*?) S\[(\d*)\].(.*?)=\"(.*)\"/i,				// Example: COMMAND S[1].key=value
		eventRegex:			/EVENT C\[(\d*)\].Z\[(\d*)\]\!(.*?)/i			// Example: EVENT C[1].Z[1]!EventName Value
	};

	// zone object prototype
	var zone = function() {
		this.controller = 1;		// Controller the zone belongs to
		this.name = "";				// Zone name
		this.source = 0;			// Source number
		this.volume = 0;			// 0 to 50
		this.bass = 0;				// -10 to 10
		this.treble = 0;			// -10 to 10
		this.balance = 0;			// -10 to 10
		this.loudness = "OFF";		// OFF, ON
		this.turnOnVol = 20;		// 0 to 50
		this.doNotDisturb = "OFF";	// OFF, ON, SLAVE
		this.partyMode = "OFF";		// OFF, ON, MASTER
		this.status = "OFF";		// power status: OFF, ON, STANDBY
		this.mute = "OFF";			// OFF, ON
		this.sharedSource = "OFF";	// OFF, ON
	};

	// source object prototype
	var source = function() {
		this.name = "";
		this.type = "";
		this.composerName = "";
		this.channel = "";
		this.coverArtURL = "";
		this.channelName = "";
		this.genre = "";
		this.artistName = "";
		this.albumName = "";
		this.playlistName = "";
		this.songName = "";
		this.programServiceName = "";
		this.radioText = "";
		this.radioText2 = "";
		this.radioText3 = "";
		this.radioText4 = "";
		this.shuffle = 0; // 0 = OFF, 1 = SONG, 2 = ALBUM
		this.mode = "";
	};

	self.onConnectionChange = function(system, connected, remote) {
		if (connected) {
			// Connected!
			LOG_RUSSOUND("Connected");

			// On connection startup, we want to have the last selected zone showing
			// So we need to persist the zone selection in a global token
			// Check that the global token exists, and has been set. Default will be zone 0 (undefined)
			// in which case we use the lowest defined zone to start with. Then each launch we use the persisted value
			CF.getJoin(CF.GlobalTokensJoin, function(j, v, tokens) {
				if (tokens["[lastzone]"] !== undefined) {
					self.selectZone(tokens["[lastzone]"]);
				} else {
					// No token in the GUI, create one that persists... TODO
				}

				// Get list of zones
				self.getSources();

				// Wait for sources, then get list of zones
				setTimeout(function() {self.getZones();}, 100);
			});

		} else {
			// Disconnected!
			LOG_RUSSOUND("Disconnected");

			// Issue WOL message now to ensure that the device is awake
			// To do this we need to persist the MAC address of the controller
		}
	};

	self.onIncomingData = function(theSystem, matchedString) {
		// Incoming data can be a variety of message types, use regex to determine which it is and grab the relavent data

		// Split the incoming string via comma. This separates any combined messages as per RIO protocol
		var msgs = matchedString.split(",");
		// Grab the reply command as it does not repeat for each part of a combined message, yet we need it in each message for regex matches.
		var replyCmd = msgs[0].substr(0, msgs[0].indexOf(" "));
		for (var i = 0; i<msgs.length; i++) {
			// Get the message
			var theMsg = msgs[i];
			// Append the reply command to each additional message for regex matching purposes
			// because only the first message will actually contain the reply command
			if (i != 0) {
				theMsg = replyCmd + " " + theMsg;
			}
			if (self.eventRegex.test(theMsg)) {				// Test if its an event message
				// Event message			
				var matches = self.eventRegex.exec(theMsg);
				// matches:
				// 0 = whole string
				// 1 = Controller number
				// 2 = Zone number
				// 3 = event name and data (manually parse as not all events have data, just a name)


				// Reset the regex to work correctly after each consecutive match
				self.eventRegex.lastIndex = 0;
				
			} else if (self.zoneRegex.test(theMsg)) {		// Test if its a zone message
				// Event message			
				var matches = self.zoneRegex.exec(theMsg);
				// matches:
				// 0 = whole string
				// 1 = Command name
				// 2 = Controller number
				// 3 = Zone number
				// 4 = parameter
				// 5 = value

				var theZone = self.getZone(matches[2], matches[3]);

				switch (matches[4]) { // parameter
					case "name":
						var oldName = self.zones["c"+matches[2]][matches[3]-1].name;
						self.zones["c"+matches[2]][matches[3]-1].name = matches[5];
						self.zones["c"+matches[2]][matches[3]-1].controller = matches[2];
						// Add the item to the zone list, ONLY if name didn't match previous spot
						if (oldName != matches[5]) {
							CF.listAdd(self.zoneList, [
								{
									s1: matches[5], // Zone name string
									d1: {
										tokens: {
											"[zonenum]": theZone // Zone number token
										}
									},
								}
							]);
						}
						if (self.currentZone == theZone) {
							// Update the zone name text
							CF.setJoin("s1", matches[5]);
						} else if (self.currentZone == 0) {
							// Select the current zone if no previous zone was selected
							self.selectZone(theZone);
						}
						break;
					case "status":
						self.zones["c"+matches[2]][matches[3]-1].status = matches[5];
						if (self.currentZone == theZone) {
							CF.setJoin("d1", (matches[5]=="ON") ? 1 : 0);
						}
						break;
					case "volume":
						self.zones["c"+matches[2]][matches[3]-1].volume = matches[5];
						if (self.currentZone == theZone) {
							CF.setJoin("a1", (65535/50)*parseInt(matches[5]));
							CF.setJoin("s2", (matches[5]*2)+"%");
						}
						break;
					case "mute":
						self.zones["c"+matches[2]][matches[3]-1].mute = matches[5];
						if (self.currentZone == theZone) {
							CF.setJoin("d2", (matches[5]=="ON") ? 1 : 0);
						}
						break;
					case "currentSource":
						self.zones["c"+matches[2]][matches[3]-1].currentSource = matches[5];
						if (self.currentZone == theZone) {
							if (self.currentSource != matches[5]) {
								// new source selected
								self.currentSource = matches[5];
								// Update the source list to show the selected source
								CF.setJoin("s3", self.sources[self.currentSource-1].name);
							}
							// Change the source subpage here based on the source type
						}
						break;
					case "doNotDisturb":
						self.zones["c"+matches[2]][matches[3]-1].doNotDisturb = matches[5];
						if (self.currentZone == theZone) {
							CF.setJoin("d3", (matches[5]=="OFF") ? 0 : 1);
						}
						break;
					case "partyMode":
						self.zones["c"+matches[2]][matches[3]-1].partyMode = matches[5];
						if (self.currentZone == theZone) {
							CF.setJoin("d4", (matches[5]=="OFF") ? 0 : 1);
							CF.setJoin("d5", (matches[5]=="MASTER") ? 1 : 0);
						}
						break;
					case "sharedSource":
						self.zones["c"+matches[2]][matches[3]-1].sharedSource = matches[5];
						if (self.currentZone == theZone) {
							CF.setJoin("d6", (matches[5]=="OFF") ? 0 : 1);
						}
						break;
					case "loudness":
						self.zones["c"+matches[2]][matches[3]-1].loudness = matches[5];
						if (self.currentZone == theZone) {
							CF.setJoin("d7", (matches[5]=="OFF") ? 0 : 1);
						}
						break;
				}


				// Reset the regex to work correctly after each consecutive match
				self.zoneRegex.lastIndex = 0;
				
			} else if (self.controllerRegex.test(theMsg)) {	// Test if its a controller message
				// Controller message			
				var matches = self.controllerRegex.exec(theMsg);
				// matches:
				// 0 = whole string
				// 1 = Command name
				// 2 = Controller number
				// 3 = parameter
				// 4 = value


				// Reset the regex to work correctly after each consecutive match
				self.controllerRegex.lastIndex = 0;
				
			} else if (self.sourceRegex.test(theMsg)) {		// Test if its a source message
				// Source message			
				var matches = self.sourceRegex.exec(theMsg);
				// matches:
				// 0 = whole string
				// 1 = Command name
				// 2 = Source number
				// 3 = parameter
				// 4 = value

				var sourceNum = matches[2]-1;
				var value = matches[4];

				switch (matches[3]) { // parameter
					case "type":
						self.sources[sourceNum].type = value;
						break;
					case "name":
						var oldName = self.sources[sourceNum].name;
						self.sources[sourceNum].name = value;
						// Add the item to the source list, ONLY if name didn't match previous spot
						if (self.sources[sourceNum].type != "" && oldName != value) {
							CF.listAdd(self.sourceList, [
								{
									s1: value, // Zone name string
									d1: {
										tokens: {
											"[sourcenum]": matches[2] // Zone number token
										}
									},
								}
							]);
						}
						break;
				}

				// Reset the regex to work correctly after each consecutive match
				self.sourceRegex.lastIndex = 0;
			}
		}
	};

	self.allZonesOff = function() {
		self.sendEvent(1, 1, "AllOff");
	};

	self.allZonesOn = function() {
		self.sendEvent(1, 1, "AllOn");
	};

	self.zonePowerToggle = function(zone) {
		if (zone === undefined) {
			zone = self.currentZone;
		}
		if (zone > 0 && zone < 49) {
			var c = self.getZoneController(zone);
			var z = self.getControllerZone(zone);
			var theZone = self.zones["c"+c][z];
			if (theZone.status == "ON") {
				// Turn the zone OFF
				self.sendEvent(c, z+1, "ZoneOff");
			} else {
				// Turn the zone ON
				self.sendEvent(c, z+1, "ZoneOn");
			}
		}
	};

	self.zoneMuteToggle = function(zone) {
		if (zone === undefined) {
			zone = self.currentZone;
		}
		if (zone > 0 && zone < 49) {
			var c = self.getZoneController(zone);
			var z = self.getControllerZone(zone);
			self.sendEvent(c, z+1, "KeyRelease", "Mute");
		}
	};

	self.volumeUp = function(zone) {
		if (zone === undefined) {
			zone = self.currentZone;
		}
		if (zone > 0 && zone < 49) {
			var c = self.getZoneController(zone);
			var z = self.getControllerZone(zone);
			var theZone = self.zones["c"+c][z];
			// Turn the volume up
			self.sendEvent(c, z+1, "KeyPress", "VolumeUp");
		}
	};

	self.volumeDown = function(zone) {
		if (zone === undefined) {
			zone = self.currentZone;
		}
		if (zone > 0 && zone < 49) {
			var c = self.getZoneController(zone);
			var z = self.getControllerZone(zone);
			var theZone = self.zones["c"+c][z];
			// Turn the volume up
			self.sendEvent(c, z+1, "KeyPress", "VolumeDown");
		}
	};

	self.zoneDNDToggle = function(zone) {
		if (zone === undefined) {
			zone = self.currentZone;
		}
		if (zone > 0 && zone < 49) {
			var c = self.getZoneController(zone);
			var z = self.getControllerZone(zone);
			var theZone = self.zones["c"+c][z];
			if (theZone.doNotDisturb == "ON") {
				// Turn the zone DND OFF
				self.sendEvent(c, z+1, "DoNotDisturb", "OFF");
			} else {
				// Turn the zone DND ON
				self.sendEvent(c, z+1, "DoNotDisturb", "ON");
			}
		}
	};

	self.zonePartyToggle = function(zone) {
		if (zone === undefined) {
			zone = self.currentZone;
		}
		if (zone > 0 && zone < 49) {
			var c = self.getZoneController(zone);
			var z = self.getControllerZone(zone);
			var theZone = self.zones["c"+c][z];
			if (theZone.partyMode == "OFF") {
				// Turn the zone Party Mode ON
				self.sendEvent(c, z+1, "PartyMode", "ON");
			} else {
				// Turn the zone Part Mode OFF
				self.sendEvent(c, z+1, "PartyMode", "OFF");
			}
		}
	};

	self.getZones = function() {
		// Loop through zones to get their details
		for (var i = 1; i <= self.controller.numZones; i++) {
			// First get the names of each zone
			setTimeout(function(zone) {
				var c = self.getZoneController(zone);
				var z = self.getControllerZone(zone);
				self.sendMsg("GET", c, z+1, null, ".name");
			}, i*10, i);
		}
	};

	self.getSources = function() {
		// Get list of sources
		for (var i = 1; i <= self.controller.numSources; i++) {
			// First get the names of each zone
			setTimeout(function(sourceIndex) {
				self.send(self.buildMsg("GET", null, null, sourceIndex, ".type") + "," + self.buildMsg("", null, null, sourceIndex, ".name"));
			}, i*10, i);
		}
	};

	self.selectZoneList = function(listJoin) {
		// listJoin example: l1:0:d1
		CF.getJoin(listJoin, function(j,v,t) {
			self.selectZone(t["[zonenum]"]);
		});
		// After a zone is selected, ignore new "zone name" updates so they dont append to zone list each time.
		//self.zoneListComplete = true;
	};

	self.selectZone = function(zone) {
		if (zone > 0 && zone < 49) {
			// Stop watching the previous zone if one was selected
			if (self.currentZone > 0) {
				var c = self.getZoneController(self.currentZone);
				var z = self.getControllerZone(self.currentZone);
				self.sendMsg("WATCH", c, z+1, null, " OFF");
			}

			// Select the zone, adjust all on screen data for the new zone, show the selected zones source control subpage
			self.currentZone = zone;
			var c = self.getZoneController(zone);
			var z = self.getControllerZone(zone);
			var theZone = self.zones["c"+c][z];
			LOG_RUSSOUND("Current Zone: "+theZone.name);
			// Start watching the current zone
			self.sendMsg("WATCH", c, z+1, null, " ON");

			// Save new zone to global token
			CF.setToken(CF.GlobalTokensJoin, "[lastzone]", zone);
		}
	};

	self.selectSourceList = function(listJoin) {
		// listJoin example: l2:0:d1
		CF.getJoin(listJoin, function(j,v,t) {
			self.selectSource(t["[sourcenum]"]);
		});
		// After a zone is selected, ignore new "zone name" updates so they dont append to zone list each time.
		//self.zoneListComplete = true;
	};

	self.selectSource = function(source) {
		if (source > 0 && source < 13) {
			// Stop watching the previous source if one was selected
			if (self.currentSource > 0) {
				self.sendMsg("WATCH", null, null, self.currentSource, " OFF");
			}

			// Start watching the current source
			self.sendMsg("WATCH", null, null, source, " ON");

			// Set the zone to the chosen source
			var c = self.getZoneController(self.currentZone);
			var z = self.getControllerZone(self.currentZone);
			self.sendEvent(c, z+1, "SelectSource", source);
		}
	};

	self.buildMsg = function(cmd, c, z, s, msg) {
		var newMsg
		if (cmd !== null) {
			newMsg = cmd.toUpperCase() + " ";
		}
		if (c !== null) {
			// Controller number defined, so use it in the command
			newMsg += "C["+c+"]";
		}
		if (z !== null) {
			if (c !== null) {
				newMsg += ".";
			}
			// Zone number defined, so use it in the command
			newMsg += "Z["+z+"]";
		}
		if (s !== null) {
			// Source number defined, so use it in the command
			newMsg += "S["+s+"]";
		}
		return newMsg+msg;
	};

	self.sendEvent = function(c, z, event, data1, data2) {
		var newMsg = "!"+event;
		if (data1 !== undefined) {
			newMsg += " "+data1;
		}
		if (data2 !== undefined) {
			newMsg += " "+data2;
		}
		self.sendMsg("EVENT", c, z, null, newMsg);
	};

	self.sendMsg = function(cmd, c, z, s, msg) {
		var newMsg = self.buildMsg(cmd, c, z, s, msg);

		CF.send("Russound", newMsg+"\x0D");
		LOG_RUSSOUND("SENT - ", newMsg);
	};

	self.send = function(msg) {
		CF.send("Russound", msg+"\x0D");
		LOG_RUSSOUND("SENT - ", msg);
	};

	// Helper function for using zones 1 - 48 to return the controller number
	self.getZoneController = function(zone) {
		return Math.floor((zone-1)/8)+1;
	};

	// Helper function for zones 1-48 to return the true zone array number (0-7)
	self.getControllerZone = function(zone) {
		if (zone > 0) {
			return (zone-1)%8;
		} else {
			return 0;
		}		
	};

	// Helper function to return the zone number (1-48) from the controller and zone numbers
	self.getZone = function(c, z) {
		return (parseInt(c)-1) * 8 + parseInt(z);
	};
	
	// ------------------------------------------------
	// Set everything up on object creation
	// ------------------------------------------------

	// Watch the system for feedback processing
	CF.watch(CF.FeedbackMatchedEvent, systemName, feedbackName, self.onIncomingData);

	// Watch the system connection status
	CF.watch(CF.ConnectionStatusChangeEvent, systemName, self.onConnectionChange, true);

	// Create the zone array
	for (var i = 0; i < self.controller.numZones; i++) {
		self.zones["c"+self.getZoneController(i+1)].push(new zone());
	}

	// Create the sources array
	for (var i = 0; i < self.controller.numSources; i++) {
		self.sources.push(new source());
	}

	return self;
};

// ======================================================================
// Create an instance of the Russound Controller object, only one
// instance needed for up to 48 zones, 8 sources.
// ======================================================================
var RussoundC = new Russound("Russound", "Russound Incoming Data");