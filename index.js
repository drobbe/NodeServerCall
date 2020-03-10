var app = require('express')();

var aio = require('asterisk.io');
var ami = null;

ami = aio.ami('localhost',5038,'lponce','lponce');


ami.on('error', function(err){
    err = JSON.parse(JSON.stringify(err));
    console.log(err);
});

ami.on('eventHangup', function(data){
        console.log(data)
});
