var app = require("express")();
var bodyParser = require("body-parser");
var fs = require("fs");
var ini = require("ini");
const statusPublisher = require("./status.publisher");
const shellExec = require("shell-exec");
const config = ini.parse(fs.readFileSync("/var/www/html/class/db/conf.ini", "utf-8"));
let statusArray = require("./status.json");

//mezclado a master
console.log("Configuraciones: " + config.sigma.userDB);

var options = {
  key: fs.readFileSync("/etc/apache2/ssl2/mibot.key.pem"),
  cert: fs.readFileSync(config.sigma.certNode),
};
var https = require("https").createServer(options, app);
var io = require("socket.io")(https);

var aio = require("asterisk.io");
var ami = null;

ami = aio.ami("localhost", 5038, "lponce", "lponce");

ami.on("error", function (err) {
  err = JSON.parse(JSON.stringify(err));
  console.log(err);
});

var clientes = new Object();

var mysql = require("mysql");

var con = mysql.createConnection({
  host: config.sigma.serverDB,
  user: config.sigma.userDB,
  password: config.sigma.passDB,
  database: config.sigma.DB,
});

con.connect(function (err) {
  if (err) throw err;
  console.log("Connected!");
});

function insertHistorico(dataInsert) {
  let sqlWorkspace = `SELECT
                        a.uid_workspace id_project,
                        c.uid_workspace id_cliente,
                        c.id id_client_mibotair,
                        c.time_zone
                    FROM
                        batch.carga cg
                        INNER JOIN batch.asignacion a ON a.id = cg.asignacion_id
                        INNER JOIN batch.cliente c ON c.id = a.id_cliente 
                    WHERE
                        cg.id = ?
                        AND a.uid_workspace IS NOT NULL`;
  con.query(sqlWorkspace, dataInsert[0][3], function (err, result) {
    if (err) {
      console.log("error consulta pase a air", err);
    } else {
      try {
        //console.log("OK PUBLICARA", dataInsert[0][3], result);
        if (result.length > 0 && dataInsert[0][5] !== null) {
          let dateStatus = new Date().toLocaleString("es-ES", {
            timeZone: result[0].time_zone,
          });
          //console.log(statusArray, dataInsert[0][4]);
          let description = statusArray.find((sa) => sa.id === dataInsert[0][5]);
          //console.log(description);

          const payload_publish = {
            meta: {
              ip: "34.95.187.108",
              time: new Date(),
              user: [],
              origin: "mibotair.agents.status",
            },
            data: {
              uid_project: result[0].id_project,
              uid_client: result[0].id_cliente,
              id_client_mibotair: result[0].id_client_mibotair,
              datetime: dateStatus,
              agent: dataInsert[0][0],
              latency: dataInsert[0][2],
              campaign: dataInsert[0][3],
              description: description && description.nombre !== undefined && description.nombre !== null ? description.nombre : "",
              id_status: dataInsert[0][5],
            },
          };
          //statusPublisher.publish(payload_publish);
        }
      } catch (error) {
        console.log(error);
        //let dataLog = JSON.stringify(payload_publish);

        return con.query("INSERT INTO `batch`.`log_consumer_status`(`data`) VALUES ?", [dataLog], function (err, result) {
          if (err) throw err;
          console.log("Error logeando error : " + result);
        });
      }
    }
  });

  //insertar a la tabla historica

  return con.query(
    "INSERT INTO `core`.`agente_his`(`agente`, `status`, latencia, campana, descripcion,id_status) VALUES ?",
    [dataInsert],
    function (err, result) {
      if (err) throw err;
      //console.log("Result: " + result);
    }
  );
}

function insertTimeAgent(agent, segundos) {
  //Actualizar el tiempo del registro anterior
  // let values = [
  //     [agent, segundos]
  // ]
  return con.query(`CALL core.sp_insert_time_agent_v2('${agent}',${segundos})`, function (err, result) {
    if (err) throw err;
    //console.log("Result sp: " + result);
  });
}

function getIdByEstado(estado) {
  var id_estado = null;

  switch (estado.trim()) {
    case "Capacitacion":
      id_estado = 7;
      break;
    case "Soporte":
      id_estado = 5;
      break;
    case "Baño":
      id_estado = 3;
      break;
    case "Descanso":
      id_estado = 4;
      break;
    case "Back":
      id_estado = 6;
      break;
    default:
      break;
  }

  return id_estado;
}

io.on("connection", function (socket) {
  socket.on("disconnect", function () {
    usuario = socket.usuario;

    estado = clientes[socket.usuario];

    if (usuario == undefined) {
      return;
    }

    con.query("Update agente set status = 0, campana = null where usuario = ?", usuario, function (err, result) {
      if (err) throw err;
      //console.log("Result: " + result);
    });

    console.log("Intento de desconexión de: " + usuario);

    insertTimeAgent(socket.usuario, clientes[socket.usuario].tiempo);
    //Insertar latencia y una vez obtenida insertar con el estado
    shellExec(`asterisk -rx 'sip show peer ${socket.usuario}' | grep Status`)
      .then(function (shell) {
        let resultShell = shell.stdout;
        let latencia = "";

        if (resultShell != "") {
          let status = resultShell.split(":");
          latencia = status[1].trim();
          // console.log(`Latencia del user ${socket.usuario} => ${latencia}`);
        }

        dataInsert = [[socket.usuario, "0", latencia, socket.idcampana, "Agente se desconecto", 9]];
        insertHistorico(dataInsert);
      })
      .catch(console.log);

    if (estado.cerroSesion == undefined) {
      setTimeout(function () {
        console.log(clientes[socket.usuario].reconecto);

        if (clientes[socket.usuario].reconecto === false) {
          console.log(socket.usuario + " se desconecto del chat luego de 15 seg." + socket.id);
          delete clientes[socket.usuario];
        } else {
          clientes[socket.usuario].reconecto = false;
        }
      }, 16000);
    } else {
      clientes[socket.usuario].reconecto = false;
      delete clientes[socket.usuario];
      console.log("---------------No es neseario reemplzar------------------");
    }
  });

  socket.on("join", function (usuario, idcampana, nomcampana, userName, environment, reconnect = true, enPausa = false) {
    //test = socket.stringify();
    idcampana = idcampana.split("|")[0];
    console.log("JOIN", usuario, typeof idcampana, idcampana, isNumeric(idcampana), nomcampana, userName, environment);
    if (!isNumeric(idcampana)) {
      io.to(socket.id).emit("notificaction", { mensaje: "Seleccione una campaña valida para conectarse" });
      return;
    }

    if (clientes[usuario] != undefined) {
      clientes[usuario].reconecto = reconnect;
      clientes[usuario].sockedId = socket.id;
      socket.usuario = usuario;
      socket.idcampana = idcampana;
      socket.nombreCampana = nomcampana;
      socket.userName = userName;

      if (environment !== "regi") {
        console.log("-----", enPausa);
        clientes[usuario].status = enPausa === true ? 4 : 1;
      } else {
        clientes[usuario].status = 11;
      }

      console.log("--Reemplazo-- Update agente set status = " + clientes[usuario].status + " where usuario = ?", usuario);

      con.query("Update agente set status = " + clientes[usuario].status + " where usuario = ?", usuario, function (err, result) {
        if (err) throw err;
        console.dir("Result: " + result, { depth: null });
      });
      if (environment == "changeCampaing") {
        insertTimeAgent(socket.usuario, -1);
        clientes[usuario] = { sockedId: socket.id };
        clientes[usuario].status = 1;
        clientes[usuario].nombre = usuario;
        clientes[usuario].idcampana = idcampana;
        clientes[usuario].nombreCampana = nomcampana;
        clientes[usuario].userName = userName;
        clientes[usuario].tiempo = -1;
        clientes[usuario].estado = "";
        clientes[usuario].reconecto = false;
      }
      return;
    }

    socket.usuario = usuario;
    socket.idcampana = idcampana;
    socket.nombreCampana = nomcampana;
    socket.userName = userName;

    let newStatus = 1;
    let queryDefault = "Update agente set status = ? where usuario = ?";
    if (environment == "regi") {
      newStatus = 11;
      con.query("Update agente set status = ?, campana = ? where usuario = ?", [newStatus, idcampana, socket.usuario], function (err, result) {
        if (err) throw err;
        //console.log("Result: " + result);
      });
    } else {
      con.query("Update agente set status = ? where usuario = ?", [newStatus, socket.usuario], function (err, result) {
        if (err) throw err;
        //console.log("Result: " + result);
      });
    }

    //Antes del update verifico la variable
    if (clientes[usuario] != undefined) {
      insertTimeAgent(socket.usuario, clientes[usuario].tiempo);
    }

    //Insertar latencia y una vez obtenida insertar con el estado
    shellExec(`asterisk -rx 'sip show peer ${socket.usuario}' | grep Status`)
      .then(function (shell) {
        let resultShell = shell.stdout;
        let latencia = "";

        if (resultShell != "") {
          let status = resultShell.split(":");
          latencia = status[1].trim();
          // console.log(`Latencia del user ${socket.usuario} => ${latencia}`);
        }

        dataInsert = [[socket.usuario, newStatus.toString(), latencia, socket.idcampana, "Usuario se conecto", 10]];
        insertHistorico(dataInsert);
      })
      .catch(console.log);

    console.log(socket.usuario + " se ha conectado." + socket.nombreCampana);
    clientes[usuario] = { sockedId: socket.id };
    clientes[usuario].status = newStatus;
    clientes[usuario].nombre = usuario;
    clientes[usuario].idcampana = idcampana;
    clientes[usuario].nombreCampana = nomcampana;
    clientes[usuario].userName = userName;
    clientes[usuario].tiempo = -1;
    clientes[usuario].estado = "";
    clientes[usuario].reconecto = false;
  });

  socket.on("cerrarSesion", function () {
    usuario = socket.usuario;
    clientes[usuario].cerroSesion = true;
    console.log("cerroSesion", clientes.usuario);
    return true;
  });

  socket.on("pausa", function (estado) {
    usuario = socket.usuario;

    // idcampana = clientes[usuario].idcampana;
    if (clientes[usuario] === undefined) {
      return;
    }
    clientes[usuario].estado = estado;
    clientes[usuario].status = 4;

    con.query("Update agente set status = 4 where usuario = ?", socket.usuario, function (err, result) {
      if (err) throw err;
      //console.log("Result: " + result);
    });

    //Actualizar el tiempo del registro anterior
    insertTimeAgent(socket.usuario, clientes[usuario].tiempo);
    socket.estado = estado;

    //Insertar latencia y una vez obtenida insertar con el estado
    shellExec(`asterisk -rx 'sip show peer ${socket.usuario}' | grep Status`)
      .then(function (shell) {
        let resultShell = shell.stdout;
        let latencia = "";

        if (resultShell != "") {
          let status = resultShell.split(":");
          latencia = status[1].trim();
          // console.log(`Latencia del user ${socket.usuario} => ${latencia}`);
        }

        let id_estado = getIdByEstado(socket.estado);
        dataInsert = [[socket.usuario, "4", latencia, socket.idcampana, "Ha pausado por " + socket.estado, id_estado]];
        insertHistorico(dataInsert);
      })
      .catch(console.log);

    clientes[usuario].tiempo = -1;

    console.log(socket.usuario + " se ha pausado por " + socket.estado);
  });

  socket.on("reanudar", function (estado) {
    usuario = socket.usuario;
    if (clientes[usuario] === undefined) {
      return;
    }
    clientes[usuario].estado = "";
    clientes[usuario].status = 1;

    con.query("Update agente set status = 1 where usuario = ?", socket.usuario, function (err, result) {
      if (err) throw err;
      //console.log("Result: " + result);
    });

    //Actualizar el tiempo del registro anterior
    insertTimeAgent(socket.usuario, clientes[usuario].tiempo);
    socket.estado = estado;
    //Insertar latencia y una vez obtenida insertar con el estado
    shellExec(`asterisk -rx 'sip show peer ${socket.usuario}' | grep Status`)
      .then(function (shell) {
        let resultShell = shell.stdout;
        let latencia = "";

        if (resultShell != "") {
          let status = resultShell.split(":");
          latencia = status[1].trim();
          // console.log(`Latencia del user ${socket.usuario} => ${latencia}`);
        }

        // let id_estado  = getIdByEstado(socket.estado);
        let id_estado = 10;
        dataInsert = [[socket.usuario, "1", latencia, socket.idcampana, "Ha reconectado luego de " + socket.estado, id_estado]];
        insertHistorico(dataInsert);
      })
      .catch(console.log);

    clientes[usuario].tiempo = -1;
    console.log(socket.usuario + " se ha se reconectado luego de " + socket.estado);
  });

  // Ej FOCO
  // Probar si es cuando cliente cuelga llamada
  socket.on("hangUpInbound", function (Data) {
    // Channel => SIP/usuario1-aav43
    var Channel = Data.Channel;
    ami.action("Hangup", { Channel: Channel }, function (data) {
      console.log("evt hangUpInbound");
      console.log(data);

      // Si llega al evento cambiamos el 'status' a 4
      /* usuario = data.Channel.split("-")[0].split("/")[1];
                console.log(usuario + "cliente colgo llamada"); // text prueba para saber ingreso de evento
                clientes[usuario].status = 4;
                clientes[usuario].tiempo = -1;

                con.query('Update agente set status = 4 where usuario = ?', usuario, function (err, result)                                                             {
                    if (err) throw err;
                    console.log("Result: " + result);
                }); */

      // Redireccionar al evento donde cambia el estado
      io.to(clientes[usuario].sockedId).emit("eventHangup", { Data: data });
    });
  });

  socket.on("baño", function (msg) {
    con.query("Update agente set status = 5 where usuario = ?", socket.usuario, function (err, result) {
      if (err) throw err;
      //console.log("Result: " + result);
    });

    //Actualizar el tiempo del registro anterior
    insertTimeAgent(socket.usuario, clientes[socket.usuario].tiempo);

    shellExec(`asterisk -rx 'sip show peer ${socket.usuario}' | grep Status`)
      .then(function (shell) {
        let resultShell = shell.stdout;
        let latencia = "";

        if (resultShell != "") {
          let status = resultShell.split(":");
          latencia = status[1].trim();
          // console.log(`Latencia del user ${socket.usuario} => ${latencia}`);
        }

        let id_campana = clientes[usuario].idcampana;
        //insertar a la tabla historica
        dataInsert = [[socket.usuario, "5", latencia, id_campana, "Pausa por baño", 3]];
        insertHistorico(dataInsert);
      })
      .catch(console.log);

    console.log(socket.usuario + " se ha puesto en pausa");
  });
});

ami.on("eventBridgeEnter", function (data) {
  if (
    data.Context == "from-internal" ||
    data.Context == "preview" ||
    data.Context == "conference_1" ||
    data.Context == "outcall-manual" ||
    data.Context == "prueba"
  ) {
    usuario = data.Channel.split("-")[0].split("/")[1];
    console.log("---------------------");
    console.log(data.ConnectedLineName.split(","));
    const conectedLine = data.ConnectedLineName.split(",");
    console.log(conectedLine[6]);
    let server = null;
    if (conectedLine[6] !== undefined) {
      server = conectedLine[6];
    }
    if (server == "2000") {
      console.log("Enviando el Mensaje");
      msg = { mensaje: "LLamada de transferida de voicebot", agendamiento: false };
      io.to(clientes[usuario].sockedId).emit("notificaction", msg);
    }
    if (clientes[usuario] === undefined) {
      console.log("no se consiguo el usuario " + usuario);
      return;
    }
    clientes[usuario].status = 3;

    con.query("Update agente set status = 3 where usuario = ?", usuario, function (err, result) {
      if (err) throw err;
      //console.log("Result: " + result);
    });
    io.to(clientes[usuario].sockedId).emit("llamadaContestada", { Data: data });

    //Actualizar el tiempo del registro anterior
    insertTimeAgent(usuario, clientes[usuario].tiempo);

    //Insertar latencia y una vez obtenida insertar con el estado
    shellExec(`asterisk -rx 'sip show peer ${usuario}' | grep Status`)
      .then(function (shell) {
        let resultShell = shell.stdout;
        let latencia = "";

        if (resultShell != "") {
          let status = resultShell.split(":");
          latencia = status[1].trim();
          // console.log(`Latencia del user ${usuario} => ${latencia}`);
        }

        let id_campana = clientes[usuario].idcampana;
        dataInsert = [[usuario, "3", latencia, id_campana, "Ha contestado llamada", 1]];
        insertHistorico(dataInsert);
      })
      .catch(console.log);

    clientes[usuario].tiempo = -1;
  }
});

ami.on("eventHangup", function (data) {
  console.log(data);
  if (
    data.Context == "from-internal" ||
    data.Context == "preview" ||
    data.Context == "conference_1" ||
    data.Context == "outcall-manual" ||
    data.Context == "prueba"
  ) {
    usuario = data.Channel.split("-")[0].split("/")[1];
    console.log(usuario + " termino llamado");
    if (clientes[usuario] === undefined) {
      return;
    }
    clientes[usuario].status = 4;
    clientes[usuario].estado = "Tipificando";
    // Posible solucion agregar parametro, actualizar solo cuando sea status 3 (llamada)
    // and status = ?
    // [usuario,3]
    con.query("Update agente set status = 4 where usuario = ? ", usuario, function (err, result) {
      if (err) throw err;
      //console.log("Result: " + result);
    });
    io.to(clientes[usuario].sockedId).emit("llamadaTerminada", { Data: data });

    //Actualizar el tiempo del registro anterior
    insertTimeAgent(usuario, clientes[usuario].tiempo);

    //Insertar latencia y una vez obtenida insertar con el estado
    shellExec(`asterisk -rx 'sip show peer ${usuario}' | grep Status`)
      .then(function (shell) {
        let resultShell = shell.stdout;
        let latencia = "";

        if (resultShell != "") {
          let status = resultShell.split(":");
          latencia = status[1].trim();
          // console.log(`Latencia del user ${usuario} => ${latencia}`);
        }

        let id_campana = clientes[usuario].idcampana;
        dataInsert = [[usuario, "4", latencia, id_campana, "Tipificando", 2]];
        insertHistorico(dataInsert);
      })
      .catch(console.log);

    clientes[usuario].tiempo = -1;
  }
});

ami.on("eventNewchannel", function (data) {
  if (data.Context == "from-internal" || data.Context == "preview" || data.contex == "outcall-client" || data.Context == "prueba") {
    usuario = data.Channel.split("-")[0].split("/")[1];

    // console.log("----");
    // console.log(data.CallerIDName.split(","));
    // const conectedLine = data.CallerIDName.split(",");
    // let server = null;
    // if (conectedLine[6] !== undefined) {
    //   server === conectedLine[6];
    // }
    // if (server == 2000) {
    //   console.log("Enviando el Mensaje");
    //   data = { mensaje: "LLamada de transferida de voicebot", agendamiento: false };
    //   io.to(clientes[usuario].sockedId).emit("notificaction", data);
    // }

    console.log(usuario + " ha recibido llamado", data);
    try {
      if (clientes[usuario] === undefined) {
        return;
      }
      clientes[usuario].status = 2;

      io.to(clientes[usuario].sockedId).emit("llamadaConectada", { Data: data });
      con.query("Update agente set status = 2 where usuario = ?", usuario, function (err, result) {
        if (err) throw err;
        //console.log("Result: " + result);
      });

      //Actualizar el tiempo del registro anterior
      insertTimeAgent(usuario, clientes[usuario].tiempo);

      //insertar a la tabla historica
      //Insertar latencia y una vez obtenida insertar con el estado
      shellExec(`asterisk -rx 'sip show peer ${usuario}' | grep Status`)
        .then(function (shell) {
          let resultShell = shell.stdout;
          let latencia = "";

          if (resultShell != "") {
            let status = resultShell.split(":");
            latencia = status[1].trim();
            // console.log(`Latencia del user ${usuario} => ${latencia}`);
          }

          let id_campana = clientes[usuario].idcampana;
          dataInsert = [[usuario, "2", latencia, id_campana, "Llamada conectada", null]];
          insertHistorico(dataInsert);
        })
        .catch(console.log);

      clientes[usuario].tiempo = -1;
    } catch (e) {
      console.log("Perdio Conexion", e);
    }
  }
});

ami.on("eventAny", function (data) {
  //console.log(data.Event, data);
});

https.listen(3000, function () {
  console.log("listening on *:3000");
});

app.use(function (req, res, next) {
  // Website you wish to allow to connect
  res.setHeader("Access-Control-Allow-Origin", "*");
  bodyParser = require("body-parser");
  // Request methods you wish to allow
  res.setHeader("Access-Control-Allow-Methods", "GET");

  next();
});

app.use(bodyParser.json());

app.use(bodyParser.urlencoded({ extended: true }));

app.get("/usuarios", function (req, res) {
  res.status(200).json({ clientes });
});

app.get("/deletall", function (req, res) {
  clientes = [];
  res.status(200).json({ clientes });
});

app.get("/asterisk/reload", function (req, res) {
  ami.action(
    "Reload",
    {
      Module: "chan_sip.so",
    },
    function (data) {
      if (data.Response == "Error") {
        console.log("Mal Reload", data.Message);
        res.status(200).json({ data });
      }
      console.log("Reload", data.Message);
      res.status(200).json({ data });
    }
  );
});

app.post("/notificacion", function (req, res) {
  console.log(req.body);
  usuario = req.body.usuario;
  mensaje = req.body.mensaje;
  data = { mensaje: mensaje };
  if (clientes[usuario] === undefined) {
    respuesta = {
      status: "false",
      message: "El mensaje no a sido enviado por que no esta conectado el usuario: " + usuario,
    };
    res.status(200).json(respuesta);
    return;
  }
  io.to(clientes[usuario].sockedId).emit("notificaction", data);
  respuesta = { status: "ok", message: "El mensaje a sido enviado" };
  res.status(200).json(respuesta);
});

app.get("/usuario/:usuario/reanudar", function (req, res) {
  usuario = req.params.usuario;
  if (clientes[usuario] === undefined) {
    return;
  }
  clientes[usuario].status = 1;
  clientes[usuario].estado = "";
  con.query("Update agente set status = 1 where usuario = ?", usuario, function (err, result) {
    if (err) throw err;
    //console.log("Result: " + result);
  });

  //Actualizar el tiempo del registro anterior
  insertTimeAgent(usuario, clientes[usuario].tiempo);

  //Insertar latencia y una vez obtenida insertar con el estado
  shellExec(`asterisk -rx 'sip show peer ${usuario}' | grep Status`)
    .then(function (shell) {
      let resultShell = shell.stdout;
      let latencia = "";

      if (resultShell != "") {
        let status = resultShell.split(":");
        latencia = status[1].trim();
        // console.log(`Latencia del user ${usuario} => ${latencia}`);
      }

      let id_campana = clientes[usuario].idcampana;
      dataInsert = [[usuario, "1", latencia, id_campana, "Reanudar", null]];
      insertHistorico(dataInsert);
    })
    .catch(console.log);

  clientes[usuario].tiempo = -1;

  res.send(clientes[usuario]);
});

function verficiarUsuarios() {
  Object.keys(clientes).forEach(function (key) {
    clientes[key].tiempo = clientes[key].tiempo + 1;
    console.log("••••••••••••••" + new Date() + "••••••••••••••");
    console.log(key, clientes[key]);
  });
}
function isNumeric(value) {
  return /^-?\d+$/.test(value);
}

setInterval(function () {
  Object.keys(clientes).forEach(function (key) {
    if (clientes[key].nombre == undefined) {
      return;
    }
    let usuario = clientes[key].nombre;

    shellExec(`asterisk -rx 'sip show peer ${usuario}' | grep Status`)
      .then(function (shell) {
        let resultShell = shell.stdout;
        let latencia = "";

        if (resultShell != "") {
          let status = resultShell.split(":");
          latencia = status[1].trim();
          // console.log(`Latencia del user ${socket.usuario} => ${latencia}`);
        }

        clientes[key].latencia = latencia;
        //console.log(`Latencia del user 3s ${usuario} => ${latencia}`);
      })
      .catch(console.log);
  });
}, 3000);

const alertaAgendamientos = () => {
  let arrayAgentes = [];
  Object.keys(clientes).forEach(function (key) {
    arrayAgentes.push(`'${key}'`);
  });
  arrayAgentes.join(",");

  if (arrayAgentes.length === 0) return;
  const query = `SELECT *, TIMESTAMPDIFF( MINUTE, agendado, NOW()) diferencia FROM llamadas_programadas WHERE agente IN ( ${arrayAgentes} ) AND now() >= agendado AND STATUS = 1 HAVING ( diferencia > 0 AND cantidad_alertas < 1 ) OR ( diferencia > 15 AND cantidad_alertas < 2 ) OR ( diferencia > 30 AND cantidad_alertas < 3 ) OR ( diferencia > 60 AND cantidad_alertas < 3)`;
  con.query(query, function (error, results, fields) {
    if (error) {
      console.log("error consulta de Agendamientos", error);
    } else {
      results.forEach((agendamiento) => {
        enviarAlertaAgendamiento(
          agendamiento,
          `Tiene un nuevo agendamiento disponible hace ${agendamiento.diferencia} minutos, Cliente: ${agendamiento.nombre_cliente} - ${agendamiento.rut}`
        );
      });
    }
  });
};

const enviarAlertaAgendamiento = (agendamiento, mensaje) => {
  if (clientes[agendamiento.agente] === undefined) {
    return;
  }
  data = { mensaje: mensaje, agendamiento: true };
  io.to(clientes[agendamiento.agente].sockedId).emit("notificaction", data);
  actualizarAlertaBD(agendamiento.id);
};

const actualizarAlertaBD = (id) => {
  const query = `Update llamadas_programadas set cantidad_alertas = cantidad_alertas + 1 where id = ${id}`;
  con.query(query, function (error, results, fields) {
    if (error) {
      console.log("error al Actualizar de Agendamientos", err);
    }
  });
};

setInterval(alertaAgendamientos, 10000);

setInterval(verficiarUsuarios, 10000);
