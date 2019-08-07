var app = require('express')();

var fs = require('fs');
var ini = require('ini');
const config = ini.parse(fs.readFileSync('/var/www/html/class/db/conf.ini', 'utf-8'));

console.log('Configuraciones: '+config.sigma.userDB);

var options = {
    key: fs.readFileSync('/etc/apache2/ssl/mibot.key.pem'),
    cert: fs.readFileSync(config.sigma.certNode)
};
var https = require('https').createServer(options,app);
var io = require('socket.io')(https);


var aio = require('asterisk.io');
var ami = null;

ami = aio.ami('localhost',5038,'lponce','lponce');


ami.on('error', function(err){
    err = JSON.parse(JSON.stringify(err));
    console.log(err);
});

var clientes = new Object();


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

    socket.on('join', function (usuario, idcampana, nomcampana) {
        socket.usuario = usuario;
        socket.idcampana = idcampana;
        socket.nombreCampana = nomcampana;

        con.query('Update agente set status = 1 where usuario = ?',socket.usuario, function (err, result) {
            if (err) throw err;
            console.log("Result: " + result);
        });
        console.log(socket.usuario + ' se ha conectado.' + socket.nombreCampana);
        clientes[usuario] = {"sockedId": socket.id};
        clientes[usuario].status = 1;
        clientes[usuario].nombre = usuario;
        clientes[usuario].idcampana = idcampana
        clientes[usuario].nombreCampana = nomcampana
        clientes[usuario].tiempo = -1;

    });

    // Ej FOCO
    socket.on("hangUpInbound", function (Data) {
        var Channel = Data.Channel;
        ami.action('Hangup', { Channel: Channel },
            function (data) {
                console.log(data);
                console.log("evt hangUpInbound");
            }
            );
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

app.use(function (req, res, next) {

    // Website you wish to allow to connect
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Request methods you wish to allow
    res.setHeader('Access-Control-Allow-Methods', 'GET');

    next();
});



app.get('/usuarios', function(req, res) {
    res.status(200).json({ clientes});
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