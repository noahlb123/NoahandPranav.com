var mysql = require('mysql');
var express = require('express');
var session = require('express-session');
var bodyParser = require('body-parser');
var secrets = require('./secrets.js');
var socket = require('socket.io');

//change sql to work with heroku
//sql function
var connection = mysql.createConnection({
  host     : 'localhost',
  user     : 'root',
  password : secrets.password,
  database : 'logintest'
});

var app = express();
const PORT = process.env.PORT || 4002;
var server = app.listen(PORT, () => {console.log('listening on port', PORT, '...');});

//add sockets.io code here

//session setup
app.use(session({
	secret: secrets.hashKey,
	resave: true,
	saveUninitialized: true
}));
app.use(bodyParser.urlencoded({extended : true}));
app.use(bodyParser.json());

app.get('/', function(request, response) {
	response.sendFile('/Users/noahliguori-bills/Desktop/sql-testing/Public/login.html');
});

app.post('/auth', function(request, response) {
	var username = request.body.username;
	var password = request.body.password;
	if (username && password) {
		connection.query('SELECT * FROM accounts WHERE username = ? AND password = ?', [username, password], function(error, results, fields) {
			if (results.length > 0) {
				request.session.loggedin = true;
				request.session.username = username;
				response.redirect('/home');
			} else {
				response.send('Incorrect Username and/or Password!');
			}
			response.end();
		});
	} else {
		response.send('Please enter Username and Password!');
		response.end();
	}
});

app.get('/home', function(request, response) {
	if (request.session.loggedin) {
		response.send('Welcome back, ' + request.session.username + '!');
	} else {
		response.send('Please login to view this page!');
	}
	response.end();
});
