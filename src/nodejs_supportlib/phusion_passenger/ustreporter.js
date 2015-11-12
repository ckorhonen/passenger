/*
 *  Phusion Passenger - https://www.phusionpassenger.com/
 *  Copyright (c) 2010-2015 Phusion
 *
 *  "Phusion Passenger" is a trademark of Hongli Lai & Ninh Bui.
 *
 *  Permission is hereby granted, free of charge, to any person obtaining a copy
 *  of this software and associated documentation files (the "Software"), to deal
 *  in the Software without restriction, including without limitation the rights
 *  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 *  copies of the Software, and to permit persons to whom the Software is
 *  furnished to do so, subject to the following conditions:
 *
 *  The above copyright notice and this permission notice shall be included in
 *  all copies or substantial portions of the Software.
 *
 *  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 *  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 *  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 *  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 *  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 *  THE SOFTWARE.
 */

var microtime = require('microtime');
var codify = require('codify');

var reqNamespace = require('continuation-local-storage').getNamespace('passenger-request-ctx');

// Assigned by init()
var ustLog;
var log;
var appRoot;

exports.getPassengerLogger = function() {
	return log;
}

exports.getApplicationRoot = function() {
	return appRoot;
}

exports.nowTimestamp = function() {
	return microtime.now();
}

exports.getActionForDatabase = function() {
	return "DB BENCHMARK:";
}

exports.attachToRequest = function(req, res, next) {
	try {
		log.debug("ustReporter: attachToRequest(" + req.method + " " + req.url + ")");
		var attachToTxnId = req.headers['passenger-txn-id'];
		if (!attachToTxnId) {
			log.debug("Dropping Union Station request log due to lack of txnId from Passenger Core (probably a temporary UstRouter failure)");
			return next();
		}
		
		reqNamespace.bindEmitter(req);
		reqNamespace.bindEmitter(res);
	
		// The Passenger core has an open transaction associated with the request, to which we can attach info from node instrumentation.
		// However, logToUstTransaction() communicates async with the ustrouter, and is not guaranteed to deliver before the application response arrives 
		// back to the core (at which point the core will close the transaction and later additions will not be taken into account).
		// That's why we intercept response.end() (from the doc: the method, response.end(), MUST be called on each response), so we can defer it
		// until we are sure the ustrouter is aware of any attachments generated during the request handling.
		res._passenger_wrapped_end = res.end;
		res.end = function() {
			return ustLog.deferIfPendingTxns(attachToTxnId, this, res._passenger_wrapped_end, arguments);
		};
	
		// Make request transaction ID available for other instrumentation modules, e.g. mongo doesn't know about requests (which is how the core passes
		// txn ID).
		reqNamespace.run(function() {
			reqNamespace.set("attachToTxnId", attachToTxnId);
			next();
		});
	} catch (e) {
		log.error("Dropping Union Station request log due to error:\n" + e.stack);
	}
}

exports.logTimedActivityGeneric = function(activityName, tBegin, tEnd, message) {
	logTimedActivity(activityName, tBegin, tEnd, "generic", { "message": message });
}

exports.logTimedActivityMongo = function(activityName, tBegin, tEnd, query) {
	logTimedActivity(activityName, tBegin, tEnd, "mongo", { "query": query });
}

exports.logTimedActivitySQL = function(activityName, tBegin, tEnd, query) {
	logTimedActivity(activityName, tBegin, tEnd, "sql", { "query": query });
}

function logTimedActivity(activityName, tBegin, tEnd, dataType, dataObj) {
	try {
		log.debug("ustReporter: logTimedActivity(activityName: " + activityName + ")");
		var attachToTxnId = getCurrentTxnId();
		if (!attachToTxnId) {
			log.verbose("Dropping Union Station timed action log due to lack of txnId to attach to " +
				"(either request was not intercepted, cls context lost, or temporary UstRouter failure).\nCall stack: " + (new Error().stack));
			return;
		}

		var uniqueTag = codify.toCode(tBegin);
		var extraInfo = JSON.stringify({ "name": activityName, "data_type": dataType, "data": dataObj });
		var logBuf = [];
		logBuf.push("BEGIN: " + activityName + " " + uniqueTag + " (" + codify.toCode(tBegin) + ") " + new Buffer(extraInfo).toString('base64'));
		logBuf.push("END: " + activityName + " " + uniqueTag + " (" + codify.toCode(tEnd) + ")");
		ustLog.logToUstTransaction("requests", logBuf, attachToTxnId);
	} catch (e) {
		log.error("Dropping Union Station timed action log due to error:\n" + e.stack);
	}
}

exports.logException = function(name, message, trace) {
	try {
		log.debug("ustReporter: logException(name: " + name + ", message: " + message + ")");
		var logBuf = [];
		
		var requestTxnId = getCurrentTxnId();
		if (requestTxnId) {
			logBuf.push("Request transaction ID: " + requestTxnId);
		}
		
		logBuf.push("Message: " + new Buffer(message).toString('base64'));
		logBuf.push("Class: " + name);
		logBuf.push("Backtrace: " + new Buffer(trace).toString('base64'));
		//logBuf.push("Controller action: ?");

		ustLog.logToUstTransaction("exceptions", logBuf);
	} catch (e) {
		log.error("Dropping Union Station exception log due to error:\n" + e.stack);
	}
}

function getCurrentTxnId() {
	return reqNamespace.get("attachToTxnId");
}
exports.getCurrentTxnId = getCurrentTxnId;

// For patching callback systems that are incompatible with CLS out of the box.
exports.getCLSWrappedCallback = function(origCallback) {
	return reqNamespace.bind(origCallback);
}

// Called by Passenger loader, no need to call from anywhere else.
exports.init = function(logger, applicationRoot, ustLogger) {
	log = logger;
	appRoot = applicationRoot;
	ustLog = ustLogger;
}