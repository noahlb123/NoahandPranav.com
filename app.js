require('dotenv').config()
const mysql = require('mysql');
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const socket = require('socket.io');
const exphbs = require("express-handlebars");
const handlebars = require("handlebars");
const indexRouter = require('./indexRouter.js');
const nodemailer = require('nodemailer');

//init config vars
const PORT = process.env.PORT || 4002;

//connect database
var connection = mysql.createConnection({
  host     : process.env.JAWSDB_URL,
  user     : process.env.SQL_USER,
  password : process.env.SQLPASSWORD,
  database : process.env.DATABASE
});

//engine setup
var app = express();

const hbs = exphbs.create({
  extname: "hbs",
  defaultLayout: "main",
  helpers: {
    neq: function (a, b) {
      return (a != b);
    },
    eq: function (a, b) {
      return (a == b);
    },
    not: function (a) {
      return (!a);
    },
    and: function (a, b) {
      return (a && b);
    },
    empty: function(s) {
      if (typeof s == typeof new Set()) {
        return (s.size == 0);
      } else {
        return true;
      }
    }
  }
});

//db session setup
app.use(session({
	secret: process.env.HASHKEY,
	resave: true,
	saveUninitialized: true
}));

app.engine("hbs", hbs.engine);
app.set("view engine", "hbs");
app.use(bodyParser.urlencoded({extended : true}));
app.use(bodyParser.json());

app.use(express.static('public'));
app.use("/", indexRouter);

//union of sql message row data packet arrays
function messageUnion(a, b) {
  let obj = {};
  //use unique identifier id as keys
  a.forEach((item) => {
    obj[item.id] = item;
  });
  //if 2+ items have same id, they will override object key
  b.forEach((item) => {
    obj[item.id] = item;
  });
  //return obj values
  return Object.values(obj);
}

//remove item from array
function removeItem(array, item) {
  const index = array.indexOf(item);
  if (index > -1) {
    array.splice(index, 1);
  }
  return array;
}

//authenticate login
app.post('*/auth', function(request, response) {
	var email = request.body.email;
	var password = request.body.password;
	if (email && password) {
		connection.query('SELECT * FROM accounts WHERE email = ? AND password = ?', [email, password], function(error, results, fields) {
			if (results.length > 0 && results[0].active == 1) {
        request.session.userid = results[0].id;
				request.session.loggedin = true;
				request.session.email = email;
        request.session.name = results[0].name;
        request.session.password = results[0].password;
        //expires in 1 year
        request.session.cookie.maxAge = 365 * 24 * 60 * 60 * 1000;
				response.redirect('/chat');
			} else {
				response.redirect('/login/true');
			}
			response.end();
		});
	} else {
		response.send('Please enter Username and Password!');
		response.end();
	}
});


//register new user
app.post('*/register-post', function(request, response) {
  //get info from form body
	var email = request.body.email;
	var password = request.body.password;
  var name = request.body.name;
  var notifications = request.body.notifications;
  //turn notifications to boolean
  if (notifications == 'on') {
    notifications = true;
  } else {
    notifications = false;
  }
  //create (psudo) random token
  var token = Math.random().toString().replace(/\./g, '');

  //check input is valid
  if (email.length > 255) {
    response.send('max email length is 255 characters');
    response.end();
  } else if (password.length > 255) {
    response.send('max pass length is 255 characters');
    response.end();
  } else if (name.length > 63) {
    response.send('max name length is 63 characters');
    response.end();
  } else if (!email.includes('@')) {
    response.send('must be real email');
    response.end();
  } else if (email.includes(' ') || name.includes(' ')) {
    response.send('no spaces allowed');
    response.end();
  } else if (email.includes('/') || name.includes('/')) {
    response.send('no / allowed');
    response.end();
  } else if (name.includes('Both')) {
    response.send('You cant have the word "Both" in your name. Its a really weird rule because Im really bad at coding');
    response.end();
  }

  //check if email or name is already taken
  else if (email && password && name) {
    connection.query(
      'SELECT * FROM accounts WHERE email = ? OR name = ?',
      [email, name],
      (err, res, fields)=> {
        if (res.length == 0) {
          connection.query(
            "INSERT INTO accounts (name, email, password, token, notifications, grouptype, active) VALUES (?, ?, ?, ?, ?, ?, ?);",
            [
              name,
              email,
              password,
              token,
              notifications,
              false,
              false
            ],
            (err, res, fields)=> {
              if (name != 'Noah' && name != 'Pranav') {
                connection.query("INSERT INTO accounts (name, email, password, token, notifications, grouptype, active) VALUES (?, ?, ?, ?, ?, ?, ?);",
                [
                  'Both-' + name,
                  email,
                  password,
                  token,
                  notifications,
                  true,
                  false
                ],
                (err, res, fields)=> {
                  if (!err) {
            				response.redirect('/verify/' + name);
                    //send verification email
                    mail(
                      email,
                      "NoahandPranav Account Verification",
                      "This is your verification code-\n" + token
                    );
                  } else {console.log(err);}
                });
              } else {
                response.redirect('/verify/' + name);
                //send verification email
                mail(
                  email,
                  "NoahandPranav Account Verification",
                  "This is your verification code-\n" + token
                );
              }
            });
          } else {
            response.send('That email or username is already taken');
        		response.end();
          }
        }
    );
  }
});

//logout
app.post('*/logout', function(request, response) {
  //delete cookie
  request.session.destroy();
  //redirect
  response.redirect('/');
});

//verify post method
app.post('*/verify-post', function(request, response) {
  let name = request.body.name;
	let token = request.body.token;
  if (!name.includes('Both')) {
    connection.query(
      //find matching acount
      `SELECT * FROM accounts WHERE name = ? AND token = ?;`,
      [name, token],
      (err, res, feilds) => {
        //if one account matches
        if (res.length == 1) {
          //get vars for cookie
          let data = res[0];
          let email = data.email;
          let password = data.password;
          //activate account
          connection.query('UPDATE accounts SET active = ? WHERE name = ? AND token = ?;',
          [true, name, token],
          (err, res, feilds) => {
            //expires in 1 year
            request.session.cookie.maxAge = 365 * 24 * 60 * 60 * 1000;
            //set cookie
            request.session.loggedin = true;
            request.session.email = email;
            request.session.name = name;
            request.session.password = password;
            //redirect to chat
            response.redirect('/chat');
          });
        } else {
          response.redirect('back');
        }
      }
    );
  } else {
    response.send('An account with "Both" in its name cannot be verified');
    response.end();
  }
});

//verify route
//chat with Noah
app.get("/verify/:name?", (req, result) => {
  result.set('Cache-Control', 'no-store');
  let name = req.params.name;
  result.render("verify", {
    name,
  });
});


//functional chat page
app.get("/chat/:person", (req, result) => {
  result.set('Cache-Control', 'no-store');
  //get cookie vars
  let email = req.session.email;
  let name = req.session.name;
  let password = req.session.password;
  let loggedin = req.session.loggedin;
  let notes = noteObj[name];

  //get person
  let person = req.params.person;
  if (person == "noah") {
    person = "Noah";
  } else if (person == "pranav") {
    person = "Pranav";
  } else if (person == "Both") {
  } else {
    person = null;
  }

  if (loggedin) {
    //get all accounts
    connection.query('SELECT * FROM accounts;', (err, res, feilds) => {
      //reformat contact list
      var contactList = res;
      for (let i = 0; i < contactList.length; i++) {
        let elm = contactList[i];
        contactList[i] = Object.fromEntries([['name', elm.name], ['id', elm.id]]);
      }
      //get users non group chat messages from db
      connection.query(
        `SELECT messages.id, senders.name AS sender, recievers.name AS reciever, messages.message
          FROM messages
          INNER JOIN accounts AS senders
          ON senders.id = messages.sender_id AND messages.type = 0
          LEFT JOIN accounts AS recievers
          ON recievers.id = messages.reciever_id
          HAVING (reciever = ? OR sender = ?) AND NOT reciever = ?
          ORDER BY id;`,
          [name, name, 'Both-' + name],
        (err, res, feilds) => {
          //render page
          let messages = res;
          let target = name;
          let permissions = false;
          if (
            (process.env.NOAH_PASSWORD == password && name == "Noah") ||
            (process.env.PRANAV_PASSWORD == password && name == "Pranav")
          ) {
            //if permissinos, get all group chats
            permissions = true;
            connection.query(
              `SELECT messages.id, senders.name AS sender, recievers.name AS reciever, messages.message, recievers.grouptype
                FROM messages
                INNER JOIN accounts AS senders
                ON senders.id = messages.sender_id AND messages.type = 0
                LEFT JOIN accounts AS recievers
                ON recievers.id = messages.reciever_id
                HAVING recievers.grouptype = 1
                ORDER BY id;`,
              (err, res, feilds) => {
                //get union of messages and res
                messages = messageUnion(messages, res);
                //render page
                result.render("front-end-chat", {
                  name,
                  email,
                  loggedin,
                  contactList,
                  messages,
                  target,
                  person,
                  permissions,
                  notes,
                });
              });
          } else {
            //if no permissions
            //only three contacts
            contactList = [
              {name: "Noah", id: -1},
              {name: "Pranav", id: -1},
              {name: "Both", id: -1},
            ];
            //get "both" messages
            connection.query(
              `SELECT messages.id, senders.name AS sender, recievers.name AS reciever, messages.message
                FROM messages
                INNER JOIN accounts AS senders
                ON senders.id = messages.sender_id AND messages.type = 0
                LEFT JOIN accounts AS recievers
                ON recievers.id = messages.reciever_id
                HAVING reciever = ?
                ORDER BY id;`,
                ['Both-' + name],
              (err, res, feilds) => {
                //change reciever name from "Both-x" to "Both";
                res.forEach((item) => {
                  item.reciever = 'Both';
                });
                //get union of messages and res
                messages = messageUnion(messages, res);
                //render page
                result.render("front-end-chat", {
                  name,
                  email,
                  loggedin,
                  contactList,
                  messages,
                  target,
                  person,
                  permissions,
                  notes,
                });
              });
          }
          delete contactList;
          delete messages;
        }
      );
    });
  } else {
    result.render("login", {
      name,
      email,
      loggedin,
      notes,
    });
  }
});


//index
app.get("/", (req, res) => {
  res.set('Cache-Control', 'no-store');
  let email = req.session.email;
  let name = req.session.name;
  let loggedin = req.session.loggedin;
  let notes = noteObj[name];
  res.render("index", {
    name,
    email,
    loggedin,
    notes,
  });
});

//delete later
app.get("/test", (req, res) => {
  res.set('Cache-Control', 'no-store');
  let email = req.session.email;
  let name = req.session.name;
  let loggedin = req.session.loggedin;
  let notes = noteObj[name];
  res.render("temp", {
    name,
    email,
    loggedin,
    notes,
  });
});

//get user socket.id
app.get("/get-socketid/:username", (req, res) => {
  let name = req.params.username;
  res.json({
    id: nameToId[name],
    noah: noahSocket,
    pranav: pranavSocket
  });
});

//chat
app.get("/chat", (req, res) => {
  res.set('Cache-Control', 'no-store');
  let email = req.session.email;
  let name = req.session.name;
  let loggedin = req.session.loggedin;
  let notes = noteObj[name];
  res.render("chat", {
    name,
    email,
    loggedin,
    notes,
  });
});

//login
app.get("/login/:invalid?", (req, res) => {
  res.set('Cache-Control', 'no-store');
  let email = req.session.email;
  let name = req.session.name;
  let loggedin = req.session.loggedin;
  let invalid = req.params.invalid;
  let notes = noteObj[name];
  res.render("login", {
    name,
    email,
    loggedin,
    invalid,
    notes,
  });
});

//forgot
app.get("/forgot", (req, res) => {
  res.set('Cache-Control', 'no-store');
  let email = req.session.email;
  let name = req.session.name;
  let loggedin = req.session.loggedin;
  let notes = noteObj[name];
  res.render("forgot", {
    name,
    email,
    loggedin,
    notes,
  });
});

//register
app.get("/register", (req, res) => {
  res.set('Cache-Control', 'no-store');
  let email = req.session.email;
  let name = req.session.name;
  let loggedin = req.session.loggedin;
  let notes = noteObj[name];
  res.render("register", {
    name,
    email,
    loggedin,
    notes,
  });
});

app.get("/profile", (req, res) => {
  res.set('Cache-Control', 'no-store');
  let email = req.session.email;
  let name = req.session.name;
  let loggedin = req.session.loggedin;
  let notes = noteObj[name];
  if (loggedin) {
    res.render("profile", {
      name,
      email,
      loggedin,
      notes,
    });
  } else {
    res.render("login", {
      name,
      email,
      loggedin,
      notes,
    });
  }
});

//catch all, make sure this is defined last
app.get("*", (req, res) => {
  res.set('Cache-Control', 'no-store');
  let email = req.session.email;
  let name = req.session.name;
  let loggedin = req.session.loggedin;
  let search = req.params;
  let notes = noteObj[name];
  res.render("catch-all", {
    name,
    email,
    loggedin,
    search,
    notes,
  });
});


//run server
var server = app.listen(PORT, () => {console.log('listening on port', PORT, '...');});

//notifications
const noteObj = {}; //keys: names, vals: set of notifications
//temporary code to initialize with notificaiotns
noteObj["Noah"] = new Set();

function addNotification(sender, reciever) {
  if (noteObj[reciever]) {
    noteObj[reciever].add(sender);
  } else {
    noteObj[reciever] = new Set();
    noteObj[reciever].add(sender);
  }
}

function removeNotification(sender, reciever) {
  if (noteObj[reciever]) {
    noteObj[reciever].delete(sender);
  } else {
    return
  }
}

//socket.io setup
//vars
io = socket(server);
const users = {};
const nameToId = {};
var noahSocket = null;
var pranavSocket = null;

//user class
class User {
  constructor(name, email, id) {
    this.name = name;
    this.email = email;
    this.id = id;
  }
}

//add new user
function addUser(name, email, id) {
  let newUser = new User(name, email, id);
  users[id] = newUser;
  nameToId[name] = id;
}

//insert msg in db
function insertMsg(message, send_name, rcv_name, type) {
  //query for sender info
  connection.query(
    'SELECT * FROM accounts WHERE name = ?;',
    [send_name],
    (err, res, feilds) => {
      if (!err) {
        if (res.length == 1) {
          let send_sql_id = res[0].id;

          //query for rcv info
          connection.query(
            'SELECT * FROM accounts WHERE name = ?;',
            [rcv_name],
            (err, res, feilds) => {
              if (!err) {
                if (res.length == 1) {
                  let rcv_sql_id = res[0].id;
                  connection.query(
                    'INSERT INTO messages (sender_id, reciever_id, type, message) VALUES (?, ?, ?, ?);',
                    [send_sql_id, rcv_sql_id, type, message],
                    (err, res, feilds) => {return}
                  );
                }
                //handle possible errors
                else {
                  throw '2 accts have same creds: ' + res.toString();
                }
              } else {
                console.log(err);
              }
            }
          );
        } else {
          throw '2 accts have same creds: ' + res.toString();
        }
      }
    }
  );
}


io.on('connection', socket => {

  //special new user for noah
  socket.on('new-Noah', (name, email) => {
    noahSocket = socket.id;
    addUser(name, email, socket.id);
    socket.broadcast.emit('user-connected', name);
  });

  //special new user for pranav
  socket.on('new-Pranav', (name, email) => {
    pranavSocket = socket.id;
    addUser(name, email, socket.id);
    socket.broadcast.emit('user-connected', name);
  });

  //register new user
  socket.on('new-user', (name, email) => {
    addUser(name, email, socket.id);
    socket.broadcast.emit('user-connected', name);
  });

  //send to noah (depricated)
  socket.on('send-noah', data => {
    let name = users[socket.id].name;
    insertMsg(data.message, name, "Noah", 0);
    socket.to(noahSocket).emit(
      "chat-message",
      socket.id,
      {message: data['message'], name: name}
    );
  });

  //send message
  socket.on('private-chat', (id, data) => {
    let name = data.senderName;
    insertMsg(data.message, name, data.recieverName, 0);
    socket.to(id).emit(
      "chat-message",
      socket.id,
      {message: data['message'], name: name});
  });

  //send message without saving
  socket.on('private-chat-without-save', (id, data) => {
    let name = data.senderName;
    socket.to(id).emit(
      "chat-message",
      socket.id,
      {message: data['message'], name: name});
  });

  //remove notificaiton
  socket.on('remove-notification', (sender, reciever) => {
    removeNotification(sender, reciever);
  });

  //add notificaiton
  socket.on('add-notification', (id, data) => {
    //init vars
    let recieverName = data.recieverName;
    let senderName = data.senderName;
    let message = data.message;
    //add local notification
    addNotification(senderName, recieverName);
    //fix special case for group chat
    if (recieverName.includes('Both')) {
      //get recipients
      let grouChatSubject = recieverName.replace('Both-', '');
      let possibleRecipients = ['Noah', 'Pranav', grouChatSubject];
      let recipients = removeItem(possibleRecipients, senderName);
      //add local notification
      addNotification(senderName, recipients[0]);
      //get email, notifications of first reciever
      connection.query(
        'SELECT email, notifications FROM accounts WHERE name = ?',
        [recipients[0]],
        (err, res, feilds) => {
          let email = res[0].email;
          //if notifications enabled, send email
          if (res[0].notifications) {
            mail(
              email,
              'New N+P Message From ' + senderName,
              senderName + ':\n\n"' + message + '"\n\nNoahandPranav.herokuapp.com/chat/' + senderName
            );
          }
          //add local notification
          addNotification(senderName, recipients[1]);
          //get email, notifications of second reciever
          connection.query(
            'SELECT email, notifications FROM accounts WHERE name = ?',
            [recipients[1]],
            (err, res, feilds) => {
              let email = res[0].email;
              //if notifications enabled, send email
              if (res[0].notifications) {
                mail(
                  email,
                  'New N+P Message From ' + senderName,
                  senderName + ':\n\n"' + message + '"\n\nNoahandPranav.herokuapp.com/chat/' + senderName
                );
              }
            }
          );
        }
      );
    }
    //normal case
    else {
      //add local notification
      addNotification(senderName, recieverName);
      //get email, notifications of reciever
      connection.query(
        'SELECT email, notifications FROM accounts WHERE name = ?',
        [recieverName],
        (err, res, feilds) => {
          let email = res[0].email;
          //if notifications enabled, send email
          if (res[0].notifications) {
            mail(
              email,
              'New N+P Message From ' + senderName,
              senderName + ':\n\n"' + message + '"\n\nNoahandPranav.herokuapp.com/chat/' + senderName
            );
          }
        }
      );
    }
  });

  //save message without re-emiting
  socket.on('save-message', (id, data, type) => {
    let senderName = data.senderName;
    let recieverName = data.recieverName;
    //insert into sql db
    insertMsg(data.message, senderName, recieverName, type);
  });

  //user disconnect
  socket.on('disconnect', () => {
    if (socket.id == noahSocket) {
      noahSocket = null;
    } else if (socket.id == pranavSocket){
      pranavSocket = null;
    }
    if (users[socket.id]) {
      socket.broadcast.emit('user-disconnected', users[socket.id].name, socket.id);
      delete nameToId[users[socket.id].name];
      delete users[socket.id];
    }
  });
});


//node mail code
// Step 1
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.NOAH_EMAIL,
    pass: process.env.EMAIL_PASSWORD
  }
});

function mail(reciever, subject, text) {
  // Step 2
  let mailOptions = {
    from: 'mail@noahandpranav.herokuapp.com',
    to: reciever,
    subject: subject,
    text: text
  };

  // Step 3
  transporter.sendMail(mailOptions, (err, data) => {
    if (err) {
      return console.log(err);
    }
  });
}
