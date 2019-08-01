var app = require('express')();

var fs = require('fs');
var options = {
    key: fs.readFileSync('/etc/apache2/ssl/mibot.key.pem'),
    cert: fs.readFileSync('/etc/apache2/ssl/1e771d627c3cca1a.crt.pem')
};
var https = require('https').createServer(options,app);
var io = require('socket.io')(https);
var ini = require('ini');


var aio = require('asterisk.io');
var ami = null;

ami = aio.ami('localhost',5038,'lponce','lponce');


ami.on('error', function(err){
    err = JSON.parse(JSON.stringify(err));
    console.log(err);
});


const config = ini.parse(fs.readFileSync('/var/www/html/class/db/conf.ini', 'utf-8'));

console.log('Configuraciones: '+config.sigma.userDB);

var mysql = require('mysql');

var con = mysql.createConnection({
    host: "localhost",
    user: config.sigma.userDB,
    password: config.sigma.passDB,
    database:config.sigma.DB
});

con.connect(function(err) {
    if (err) throw err;
    console.log("Connected!");
});


io.on('connection', function (socket) {
    socket.on('disconnect', function () {
        con.query('Update agente set status = 4 where usuario = ?',socket.usuario, function (err, result) {
            if (err) throw err;
            console.log("Result: " + result);
        });
        console.log(socket.usuario + ' se desconecto del chat.' + socket.id);
    });
    
    socket.on('join', function (usuario) {
        socket.usuario = usuario;
        
        con.query('Update agente set status = 3 where usuario = ?',socket.usuario, function (err, result) {
            if (err) throw err;
            console.log("Result: " + result);
        });
        console.log(socket.usuario + ' se ha conectado.');
    });

    socket.on('message', function (msg) {
        io.emit('username', msg);
    });
});

ami.on('eventBridge', function(data){
    console.log('eventBridge', data);
});

https.listen(3000, function () {
    console.log('listening on *:3000');
});
