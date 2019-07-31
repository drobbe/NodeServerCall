var app = require('express')();

var fs = require('fs');
var options = {
  key: fs.readFileSync('/etc/apache2/ssl/mibot.key.pem'),
  cert: fs.readFileSync('/etc/apache2/ssl/1e771d627c3cca1a.crt.pem')
};
var https = require('https').createServer(options,app);
var io = require('socket.io')(https);
var ini = require('ini')

const config = ini.parse(fs.readFileSync('/var/www/html/class/db/conf.ini', 'utf-8'));

console.log('Configuraciones: '+config.sigma.userDB);

var mysql = require('mysql');

var con = mysql.createConnection({
  host: "localhost",
  user: config.sigma.userDB,
  password: config.sigma.passDB
});

con.connect(function(err) {
  if (err) throw err;
  console.log("Connected!");
});

io.on('connection', function (socket) {
    socket.on('disconnect', function () {
        console.log(socket.usuario + ' se desconecto del chat.' + socket.id);
    });
    
    socket.on('join', function (usuario) {
        socket.usuario = usuario;

        console.log(socket.usuario + ' se ha conectado.');
    });

    socket.on('message', function (msg) {
        io.emit('username', msg);
    });
});

https.listen(3000, function () {
    console.log('listening on *:3000');
});
