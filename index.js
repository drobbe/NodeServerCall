var app = require('express')();

var fs = require('fs');
var options = {
    key: fs.readFileSync('/etc/apache2/ssl/mibot.key.pem'),
    cert: fs.readFileSync('/etc/apache2/ssl/fc89aa986b3d35e5.crt.pem')
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

var clientes = new Object();

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
        con.query('Update agente set status = 0 where usuario = ?',socket.usuario, function (err, result) {
            if (err) throw err;
            console.log("Result: " + result);
        });
        console.log(socket.usuario + ' se desconecto del chat.' + socket.id);
        delete clientes[socket.usuario];

    });

    socket.on('join', function (usuario) {
        socket.usuario = usuario;

        con.query('Update agente set status = 1 where usuario = ?',socket.usuario, function (err, result) {
            if (err) throw err;
            console.log("Result: " + result);
        });
        console.log(socket.usuario + ' se ha conectado.');
        clientes[usuario] = {"sockedId": socket.id};
        clientes[usuario].status = 1;
        clientes[usuario].nombre = usuario;
        clientes[usuario].tiempo = -1;

    });

    socket.on('baño', function (msg) {
        con.query('Update agente set status = 5 where usuario = ?',socket.usuario, function (err, result) {
            if (err) throw err;
            console.log("Result: " + result);
        });
        console.log(socket.usuario + ' se ha puesto en pausa');
    });
});

ami.on('eventBridgeEnter', function(data){
    if(data.Context == 'from-internal'){
        usuario = data.Channel.split("-")[0].split("/")[1];
        console.log(usuario+" ha contesto llamado");
        clientes[usuario].status = 3;
        clientes[usuario].tiempo = -1;
        con.query('Update agente set status = 3 where usuario = ?',usuario, function (err, result) {
            if (err) throw err;
            console.log("Result: " + result);
        });
        io.to(clientes[usuario].sockedId).emit("llamadaContestada", { Data: data })
    }
});

ami.on('eventHangup', function(data){
    if(data.Context == 'from-internal'){
        usuario = data.Channel.split("-")[0].split("/")[1];
        console.log(usuario+" termino llamado");
        clientes[usuario].status = 4;
        clientes[usuario].tiempo = -1;
        con.query('Update agente set status = 4 where usuario = ?',usuario, function (err, result) {
            if (err) throw err;
            console.log("Result: " + result);
        });
        io.to(clientes[usuario].sockedId).emit("llamadaTerminada", { Data: data });

    }
});

ami.on('eventNewchannel', function(data){
    if(data.Context == 'from-internal'){
        usuario = data.Channel.split("-")[0].split("/")[1];
        console.log(usuario+" ha recibido llamado");
        clientes[usuario].status = 2;
        clientes[usuario].tiempo = -1;

        con.query('Update agente set status = 2 where usuario = ?',usuario, function (err, result) {
            if (err) throw err;
            console.log("Result: " + result);
        });
        io.to(clientes[usuario].sockedId).emit("llamadaConectada", { Data: data });

    }
});

ami.on('eventAny', function(data){
   // console.log(data.Event, data);
});

https.listen(3000, function () {
    console.log('listening on *:3000');
});


app.get('/usuarios', function(req, res) {
  res.send(clientes);
});

app.get('/usuario/:usuario/reanudar', function(req, res) {

    usuario = req.params.usuario;

    clientes[usuario].status = 1;
    clientes[usuario].tiempo = -1;
     con.query('Update agente set status = 1 where usuario = ?',usuario, function (err, result) {
            if (err) throw err;
            console.log("Result: " + result);
        });
    res.send(clientes[usuario]);

})

function verficiarUsuarios() {
    Object.keys(clientes).forEach(function(key) {
    clientes[key].tiempo = clientes[key].tiempo + 1;
    console.log(key, clientes[key]);

    });
}
setInterval(verficiarUsuarios, 1000);