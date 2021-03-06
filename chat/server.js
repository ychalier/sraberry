#!/usr/bin/env node

const sqlite3 = require('sqlite3').verbose();
const mime = require('mime-types');
const https = require('https');
const http = require('http');
const fs = require('fs');

const options = {
  key: fs.readFileSync('../ssl/key.pem'),
  cert: fs.readFileSync('../ssl/cert.pem'),
  ca: fs.readFileSync('../ssl/ca.pem')
};

const tasks = require('./background');
const channel = require('./channel');
const auth = require('./auth');

var portHttp = 8000;
var portHttps = 8443;

var routes = {
  'GET': {

    '^/$': function (req, res, body) {
      res.writeHead(200, {
        'Content-Type': 'text/plain'
      });
      res.write('Hello, World!');
      res.end();
    },

    '^/retrieve-token$': auth.requestToken,
    '^/validate-token$': auth.validateToken,
    '^/refresh-token$': auth.refreshToken,
    '^/list-sessions$': auth.listSessions,
    '^/logout$': auth.logout,
    '^/channel/[\\w-]+$': channel.listMessages,
    '^/ping/[\\w-]+$': channel.ping,
    '^/channels$': channel.listChannels,
    '^/webclient/': function (req, res, body) {
      const { headers, method, url } = req;
      let path = "";
      if (url == '/webclient/') {
        path = 'webclient/index.html';
      } else {
        path = url.substring(1);
      }
      fs.readFile(path, function(err, data) {
        if (err) {
          res.statusCode = 404;
          res.end();
        } else {
          res.writeHead(200, {'Content-Type': mime.lookup(path)});
          res.write(data);
          res.end();
        }
      });
    }

  },
  'POST': {

    '^/register$': auth.register,
    '^/channel/[\\w-]+$': channel.postMessage,
    '^/create-channel$': channel.createChannel

  },
  'DELETE': {
    '^/channel/[\\w-]+$': channel.deleteChannel
  }
}

function exitWithErrorCode(res, statusCode) {
  res.statusCode = statusCode;
  res.end();
}

function handleRequest(req, res) {

  // Log entring request
  const { headers, method, url } = req;
  console.log(new Date().toISOString() + "\t" + req.connection.remoteAddress
    + "\t" + method + "\t" + url);

  let body = [];  // If appropriate, will store POST body (else is kept empty)
  req.on('error', (err) => {
    console.error(err);
    exitWithErrorCode(res, 400);  // Bad Request
  }).on('data', (chunk) => {
    body.push(chunk);
  }).on('end', () => {
    body = Buffer.concat(body).toString();
    req.body = body;

    res.on('error', (err) => {
      console.error(err);
      exitWithErrorCode(res, 500);  // Internal Server Error
    });

    // routing operations: match method and then route
    var found = false;
    var radix = req.url.split("?")[0];  // remove GET arguments for matching
    if (method in routes) {
      for (route in routes[method]) {
        let regex = new RegExp(route, 'i');  // regex match case insensitive
        if (regex.exec(radix)) {  // .exec() returns 'null' if it fails
          found = true;
          routes[method][route](req, res, body);
          break;
        }
      }
    }

    if (!found) {
      exitWithErrorCode(res, 404);  // Not Found
    }

  });
}

function load_database() {
  let filename = './chat.db';
  let db = new sqlite3.Database(filename, (err) => {
    if (err) {
      console.error(err.message);
    }
  });
  db.run('CREATE TABLE IF NOT EXISTS users '
    + '(id INTEGER PRIMARY KEY AUTOINCREMENT, login TEXT, passwd TEXT)');
  db.run('CREATE TABLE IF NOT EXISTS tokens '
    + '(id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT, hash TEST, '
    + 'expires INTEGER, username TEXT, t INTEGER, agent TEXT)');
  db.run('CREATE TABLE IF NOT EXISTS channels '
    + '(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, delay INT, '
    + 'creator TEXT, passwd TEXT)');
  db.run('CREATE TABLE IF NOT EXISTS messages '
    + '(id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT, channel INTEGER, '
    + 'username TEXT, t INTEGER)');
  db.run('CREATE TABLE IF NOT EXISTS membership '
    + '(id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT, '
    + 'channelId INTEGER, lastop INTEGER)');
  return db;
}

// making sure database exists and contains the righ tables
load_database().close((err) => {
  if (err) {
    console.error(err.message);
  }
});

console.log("Starting server on port " + portHttps + "...");
https.createServer(options, handleRequest).listen(portHttps);

http.createServer((req, res) => {
  console.log(req.headers.host);
  res.writeHead(301, {Location: `https://${req.headers.host}${req.url}`});
  res.end();
}).listen(portHttp);
