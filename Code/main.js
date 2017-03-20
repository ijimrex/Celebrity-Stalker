var express = require('express'),
    exphbs  = require('express3-handlebars'),
    passport = require('passport'),
    LocalStrategy = require('passport-local');

var fs = require("fs"),
    file = "CSdatabase.db",
    exists = fs.existsSync(file),
    sqlite3 = require("sqlite3").verbose(),
    db = new sqlite3.Database(file);

var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var session = require('express-session');

var app = express();

//===============EXPRESS=================

app.use(cookieParser());
app.use(bodyParser.json());       // to support JSON-encoded bodies
app.use(bodyParser.urlencoded({     // to support URL-encoded bodies
  extended: true
}));

var hbs = exphbs.create({
    defaultLayout: 'main',
});
app.engine('handlebars', hbs.engine);
app.set('view engine', 'handlebars');

app.use(session({ secret: 'anything', resave: false, saveUninitialized: false }));
app.use(passport.initialize());
app.use(passport.session());
app.use(function(req, res, next) {
   res.header("Access-Control-Allow-Origin", "*");
   res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
   next();
});

//===============PASSPORT=================

passport.use('local', new LocalStrategy(function(username, password, done) {
  authenticateUser(username,password,function(user) {
      if (user == null) return done(null, false);
      return done(null, user);
  });
}));

passport.serializeUser(function(user, done) {
  done(null, user);
});

passport.deserializeUser(function(obj, done) {
  done(null,obj);
});

//===============ROUTES=================

//displays homepage
app.get('/', function(req, res){
  res.render('home', {user: req.user});
});

//signs-out user
app.get('/sign-out', function(req, res){
  req.logout();
  res.redirect('/');
});

//logs in existing user and displays logged-in page
app.post('/sign-in', function(req, res) {
  passport.authenticate('local', function (err, user) {
    if (!user) {
      return res.render('home', {page:'/sign-in', signinError: "Invalid username and/or password, please try again"});
    };
    req.logIn(user, function(err) {
     return res.redirect('/');
    });
  })(req, res);
});

//adds new user and displays registered page
app.post('/registered',function(req,res) {
  var username=req.body.username,
      password=req.body.password,
      password2=req.body.password2,
      email=req.body.email;
  registerCheck(username, password, password2, email, function(reg) {
    if (reg == true) {
      insertNewUser(username,password,email);
      res.render('registered', {page:'/registered',username});
    } else {
      var regError = {username:"", email:"", usernameError:"", emailError:"", passwordError:""};
      if (reg[0] != username) {
        regError.usernameError = reg[0];
      } else {
        regError.username=username;
      }
      if (reg[1] != email) {
        regError.emailError = reg[1];
      } else {
        regError.email=email;
      }
      if (reg.length == 3) {
        regError.passwordError = reg[2];
      }
      res.render('home', {page:'/registered',regError});
    }
  });
});

//edits user account information in database
app.post('/editAccount',function(req,res) {
  var password=req.body.password,
      password2=req.body.password2,
      email=req.body.email2,
      fname=req.body.fname,
      lname=req.body.lname,
      sex=req.body.sex,
      bday=req.body.bday,
      country=req.body.country,
      fbUrl=req.body.fburl,
      uid=req.user.id;
  editAccCheck(password, password2, email, fname, lname, sex, bday, country, fbUrl, uid, function(reg) {
    if (reg == true) {
      editAccount(uid,password,email, fname, lname, sex, bday, country, fbUrl);
      res.render('home', {user: req.user, page: '/editAccount'});
    } else {
      var editError = {email:"", fname:"", lname:"", sex:"", bday:"", country:"", fbUrl:"", emailError:"", passwordError:""};
      if (reg[0] != email) {
        editError.emailError = reg[1];
      } else {
        editError.email=email;
      }
      if (reg.length == 2) {
        editError.passwordError = reg[2];
      }
        editError.fname=fname;
        editError.lname=lname;
        editError.sex=sex;
        editError.bday=bday;
        editError.country=country;
        editError.fbUrl=fbUrl;
	console.log(editError);
      res.render('home', {page:'/editAccount', editError, user: req.user});
    }
  });
});

//load all marks on map
app.get('/getAllEvents', function(req,res){
  db.all("SELECT lat, lng, address, uid ,cele,type FROM map", function(err, dataget) {
    res.send(dataget);
  });
})

//delete event on map
app.get('/deleteEvent', function(req,res){
  var stmt = db.prepare("DELETE  from map where lat =? and lng=?");  
  stmt.run(req.query.lat,req.query.lng);  
  stmt.finalize();  
});

//add new event on map
app.get('/insertNewEvent', function (req, res) {
  var stmt = db.prepare("INSERT INTO map (cele,lat, lng, address, uid, type) VALUES (?,?,?,?,?,?)");
  stmt.run( req.query.name,req.query.lat, req.query.lng, req.query.address , req.query.uid, req.query.type);
  stmt.finalize();
});

//displays celebrity profile page
app.get('/celebProfile', function(req, res) {
  var fName = req.query.fName;
  var lName = req.query.lName;
  res.render('celebProfile', {cFirstName: fName, cLastName: lName, 
			      user: req.user, 
                              page: '/celebProfile',
                              helpers: {json: function (content) {return JSON.stringify(content);}}})//register handlebar helper to pass objects from server side js to client!!
})

//displays comments page
app.get('/Comments', function(req, res){
  res.render('Comments', {user: req.user, page:'/Comments'});
});

//loads user profile information from database
app.get('/getProfileInfo', function(req,res){
  db.get("SELECT username, email, fName, lName, birthday, facebookLink, country, sex FROM users WHERE id = '"+ req.query.uid + "'",
    function(err, data) {
      res.send(data);
    }
  );
})

//gets username from user ID in database
app.get('/getUsername', function(req,res){
  db.get("SELECT username FROM users WHERE id = '"+ req.query.uid + "'",
    function(err, data) {
      res.send(data);
    }
  );
})

//===============SQLITE=================

//creates new database if database doesn't exist
if(!exists) {
  console.log("Creating DB file.");
  fs.openSync(file, "w");
}

//inserts new user in the database
function insertNewUser(username,password,email) {
  var stmt = db.prepare("INSERT INTO users (username, password, email) VALUES (?,?,?)");
  stmt.run(username,password,email);
  stmt.finalize();
}

//edits user information in the database
function editAccount(uid,password,email, fname, lname, sex, bday, country, fbUrl) {
  if (password != "") {
    var stmt = db.prepare("UPDATE users SET password=(?) WHERE id='" + uid + "'");
    stmt.run(password);
    stmt.finalize();
  }
  if (email != "") {
    var stmt = db.prepare("UPDATE users SET email=(?) WHERE id='" + uid + "'");
    stmt.run(email);
    stmt.finalize();
  }
  if (fname != "") {
    var stmt = db.prepare("UPDATE users SET fname=(?) WHERE id='" + uid + "'");
    stmt.run(fname);
    stmt.finalize();
  }
  if (lname != "") {
    var stmt = db.prepare("UPDATE users SET lname=(?) WHERE id='" + uid + "'");
    stmt.run(lname);
    stmt.finalize();
  }
  if (typeof sex != 'undefined') {
    var stmt = db.prepare("UPDATE users SET sex=(?) WHERE id='" + uid + "'");
    stmt.run(sex);
    stmt.finalize();
  }
  if (bday != "") {
    var stmt = db.prepare("UPDATE users SET birthday=(?) WHERE id='" + uid + "'");
    stmt.run(bday);
    stmt.finalize();
  }
  if (country != "") {
    var stmt = db.prepare("UPDATE users SET country=(?) WHERE id='" + uid + "'");
    stmt.run(country);
    stmt.finalize();
  }
  if (fbUrl != "") {
    var stmt = db.prepare("UPDATE users SET facebookLink=(?) WHERE id='" + uid + "'");
    stmt.run(fbUrl);
    stmt.finalize();
  }
}

//checks if a user is present in the database
function authenticateUser(username,password,callback) {
  var userExists = false;
  db.each("SELECT username,id FROM users WHERE username = '" + username + "' AND password = '" + password + "' LIMIT 1", function(err, row) {		//This function will be called if a match is found in the database.
    userExists = true;
    callback(row);
  }, function(err, rows) {			//This function will be called after query.
    if (!userExists) {
      callback(null);
    }
  });
}

//checks with the database if a register is valid
function registerCheck(username, password1, password2, email, callback) {
  var validRegister = true;
  var errorlist = [];
  db.get("SELECT * FROM users WHERE username = '" + username + "'", function(err, row) {
    if (typeof row != "undefined") {
      validRegister = false;
      var usernameError = "Username is already taken";
      errorlist.push(usernameError);
    } else {
      errorlist.push(username);
    }
    db.get("SELECT * FROM users WHERE email = '" + email + "'", function(err, row) {
      if (typeof row != "undefined") {
        validRegister = false;
        var emailError = "E-mail is already used";
        errorlist.push(emailError);
      } else {
        errorlist.push(email);
      }
      if (password1 != password2) {
        validRegister = false;
        var passwordError = "Passwords do not match";
        errorlist.push(passwordError);
      }
      if (!validRegister) {
        callback(errorlist);
      } else {
        callback(validRegister);
      }
    });
  });
}

//checks with the database if an account edit is valid
function editAccCheck(password1, password2, email, fname, lname, sex, bday, country, fbUrl,uid, callback) {
  var validEdit = true;
  var errorlist = [];
    db.get("SELECT * FROM users WHERE email = '" + email + "'", function(err, row) {
      if (typeof row != "undefined") {
        validEdit = false;
        var emailError = "E-mail is already used";
        errorlist.push(emailError);
      } else {
        errorlist.push(email);
      }
      if (password1 != password2) {
        validEdit = false;
        var passwordError = "Passwords do not match";
        errorlist.push(passwordError);
      }
      if (!validEdit) {
        callback(errorlist);
      } else {
        callback(validEdit);
      }
    });
}

//creates users- and map-table in the database
db.serialize(function() {
  if(!exists) {
    db.run("CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT, password TEXT, email TEXT, fName TEXT, lName TEXT, birthday DATE, facebookLink VARCHAR, country TEXT, sex TEXT)");
    db.run("CREATE TABLE map (lat VARCHAR, lng VARCHAR, address VARCHAR, uid INTEGER, cele TEXT, type VARCHAR)");
  }
});

//===============SERVER=================

var server = app.listen(3000, function () {
  var host = server.address().address;
  var port = server.address().port;

  console.log('Celebrity Stalker: http://127.0.0.1:'+port);
});
