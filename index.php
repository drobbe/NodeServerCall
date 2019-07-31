<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="ie=edge">
    <title>Login</title>

    <link rel="stylesheet" href="https://stackpath.bootstrapcdn.com/bootstrap/4.3.1/css/bootstrap.min.css">

</head>
<body>
    <!-- <span id="messages">Connect</span> -->
    <?php echo "Hola <br>"; ?>
    <button class="btn btn-success" id="disconnect">Desconectar</button>
    <button class="btn btn-danger" id="connect">Conectar</button>

    <script src="http://localhost:3000/socket.io/socket.io.js"></script>
    <script src="https://code.jquery.com/jquery-1.11.1.js"></script>
    <script>
        var socket = io.connect('http://localhost:3000');

        $('#disconnect').click(function(){
            socket.disconnect();
        });

        $('#connect').click(function(){
            //socket.socket.reconnect();
            //socket = io.connect('http://localhost:3000',{'force new connection':true });
            socket = io.connect('http://localhost:3000',{'forceNew':true });
            socket.on('connect', function(msg){
                socket.emit('join', prompt('Usuario2'));
            });
        });

        socket.on('connect', function(msg){
            socket.emit('join', prompt('Usuario'));
        });

        socket.on("disconnect", function(){
            console.log("client disconnected from server");
        });
    </script>    
</body>
</html>