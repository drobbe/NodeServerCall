var app = require('express')();
var http = require('http').createServer(app);
var io = require('socket.io')(http);
var fs = require('fs');
// io.on('connection', function (socket) {
//     //console.log('a user connected');

    
//     socket.on('session', function (msg) {
//         io.emit('session', msg);
        
//         /* socket.on('connect', function () {
//             console.log('user connected Button');
//         });
        
//         socket.on('disconnect', function () {
//             console.log('user disconnected Button');
//         }); */
//     });
    
//     socket.on('disconnect', function () {
//         console.log(socket.name + ' has disconnected from the chat.' + socket.id);
//     });

//     socket.on('join', function (name) {
//         socket.name = name;
//         console.log(socket.name + ' joined the chat.');
//     });
// });

var options = {
  key: fs.readFileSync('/etc/apache2/ssl/mibot.key.pem'),
  cert: fs.readFileSync('/etc/apache2/ssl/1e771d627c3cca1a.crt.pem')
};

io.on('connection', function (socket) {
    console.log('Conexion: ' + socket.id);
    socket.on('disconnect', function () {
        console.log(socket.name + ' se desconecto del chat.' + socket.id);
    });
    
    socket.on('join', function (name) {
        socket.name = name;

        console.log(socket.name.edad + ' se ha conectado.');
    });

    socket.on('message', function (msg) {
        io.emit('username', msg);
    });
});

https.createServer(options).listen(3000, function () {
    console.log('listening on *:3000');
});
