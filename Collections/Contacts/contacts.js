/*
*
* Copyright (C) 2011, The Locker Project
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

// merge contacts from connectors
require.paths.push(__dirname + "/../../Common/node");
var lconfig = require('lconfig');
lconfig.load('../../Config/config.json');
var logger = require('logger');

var fs = require('fs'),
    locker = require('locker.js');
var lutil = require('lutil');
var url = require('url');

var sync = require('./sync');
var dataStore = require("./dataStore");

var lockerInfo;
var express = require('express'),
    connect = require('connect');
var app = express.createServer(connect.bodyParser());

app.set('views', __dirname);

app.get('/state', function(req, res) {
    dataStore.getTotalCount(function(err, countInfo) {
        if(err) return res.send(err, 500);
        dataStore.getLastObjectID(function(err, lastObject) {
            if(err) return res.send(err, 500);
            var objId = "000000000000000000000000";
            if (lastObject) objId = lastObject._id.toHexString();
            var updated = new Date().getTime();
            try {
                var js = JSON.parse(fs.readFileSync('state.json'));
                if(js && js.updated) updated = js.updated;
            } catch(E) {}
            res.send({ready:1, count:countInfo, updated:updated, lastId:objId});
        });
    });
});


app.get('/', function(req, res) {
    var fields = {};
    if (req.query.fields) {
        try {
            fields = JSON.parse(req.query.fields);
        } catch(E) {}
    }
    dataStore.getAll(fields, function(err, cursor) {
        if(!req.query["all"]) cursor.limit(20); // default 20 unless all is set
        if(req.query["limit"]) cursor.limit(parseInt(req.query["limit"]));
        if(req.query["offset"]) cursor.skip(parseInt(req.query["offset"]));
        cursor.toArray(function(err, items) {
            res.send(items);
        });
    });
});

app.get('/update', function(req, res) {
    sync.gatherContacts(function(){
        res.writeHead(200);
        res.end('Updating');
    });
});

app.post('/events', function(req, res) {
    if (!req.body.idr || !req.body.data) {
        logger.error('5 HUNDO');
        res.writeHead(500);
        res.end('bad data');
        return;
    }
    // we don't support these yet
    if(req.body.action == "delete")
    {
        return res.send("skipping");
    }
    var idr = url.parse(req.body.idr);
    dataStore.addData(idr.host, req.body.data, function(err, eventObj) {
        if (err) {
            res.writeHead(500);
            res.end(err);
        } else {
            res.writeHead(200);
            res.end('processed event');
        }
    });
});

app.get("/since", function(req, res) {
    if (!req.query.id) {
        return res.send([]);
    }

    var results = [];
    dataStore.getSince(req.query.id, function(item) {
        results.push(item);
    }, function() {
        res.send(results);
   });
});

app.get('/id/:id', function(req, res, next) {
    if (req.param('id').length != 24) return next(req, res, next);
    dataStore.get(req.param('id'), function(err, doc) {
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify(doc));
    })
});

// Process the startup JSON object
process.stdin.resume();
process.stdin.on('data', function(data) {
    lockerInfo = JSON.parse(data);
    locker.initClient(lockerInfo);
    if (!lockerInfo || !lockerInfo.workingDirectory) {
        process.stderr.write('Was not passed valid startup information.'+data+'\n');
        process.exit(1);
    }
    process.chdir(lockerInfo.workingDirectory);

    locker.connectToMongo(function(mongo) {
        sync.init(lockerInfo.lockerUrl, mongo.collections.contact, mongo);
        app.listen(0, function() {
            var returnedInfo = {port: app.address().port};
            process.stdout.write(JSON.stringify(returnedInfo));
        });
    });
});


