// Setup basic express server
const express = require('express');
const app = express();
const path = require('path');
const server = require('http').createServer(app);
const io = require('socket.io')(server);
const port = process.env.PORT || 8000;


const redis = require('redis');

const clientRedis = redis.createClient(6379, '10.10.1.2');

server.listen(port, () => {
  console.log('Server listening at port %d', port);
});

// Routing
app.use(express.static(path.join(__dirname, 'assets')));

// Chatroom

let numUsers = 0;
let webSocketClients = new Map();

io.on('connection', (socket) => {
  let addedUser = false;


  

  // when the client emits 'new message', this listens and executes
  socket.on('new message', (data) => {
    // we tell the client to execute 'new message'

    const message = {
      username: socket.username,
      message: data
    }

    clientRedis.rpush('messages', JSON.stringify(message));

    const pattern = /[@](.*?)($|\s)/g;

    let users = null;
    do {
      users = pattern.exec(data);
      if (users &&  users[1] != socket.username) {
        const _socket = webSocketClients.get(users[1]);
        if (_socket) _socket.emit('alert', message);
      }
    } while (users)


    socket.broadcast.emit('new message', message);
  });

  // when the client emits 'add user', this listens and executes
  socket.on('add user', (username) => {

    let users = []

    for (let client of webSocketClients.keys()) {
      users.push(client)
    }

    webSocketClients.set(username, socket);


    clientRedis.lrange('messages', 0, -1, (err, items) => {

      if (items) {
        const messages = [];

        for (let el of items) {
          messages.push(JSON.parse(el))
        }


        socket.emit('all message', messages);
      }



    });
  

    if (addedUser) return;

    // we store the username in the socket session for this client
    socket.username = username;
    ++numUsers;
    addedUser = true;
    socket.emit('login', {
      numUsers: numUsers,
      users
    });
    // echo globally (all clients) that a person has connected
    socket.broadcast.emit('user joined', {
      username: socket.username,
      numUsers: numUsers
    });
  });

  // when the client emits 'typing', we broadcast it to others
  socket.on('typing', () => {
    socket.broadcast.emit('typing', {
      username: socket.username
    });
  });

  // when the client emits 'stop typing', we broadcast it to others
  socket.on('stop typing', () => {
    socket.broadcast.emit('stop typing', {
      username: socket.username
    });
  });

  // when the user disconnects.. perform this
  socket.on('disconnect', () => {
    if (addedUser) {
      --numUsers;

      webSocketClients.delete(socket.username);

      // echo globally that this client has left
      socket.broadcast.emit('user left', {
        username: socket.username,
        numUsers: numUsers
      });
    }
  });
});
