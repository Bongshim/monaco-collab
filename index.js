import express from 'express';
import { Server } from 'socket.io';
import cors from 'cors';

const PORT = process.env.PORT || 3500;

const CodeRoomsState = {
  rooms: [],
  setRooms: function (newRoomsArray) {
    this.rooms = newRoomsArray;
  },
};

const app = express();
// cors

// Middleware
app.use(cors());
app.options('*', cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
/**
 * create a new code room
 */
app.post('/api/rooms', (req, res) => {
  const { id, host } = req.body;
  CodeRoomsState.setRooms([
    ...CodeRoomsState.rooms,
    { id, users: [], host, code: '' },
  ]);

  console.log('CodeRoomsState:', CodeRoomsState.rooms);
  res.status(201).json({
    success: true,
    message: 'Room created successfully',
  });
});

const expressServer = app.listen(PORT, () => {
  console.log(`listening on port ${PORT}`);
});

// state
const io = new Server(expressServer, {
  cors: {
    origin: '*',
  },
});

io.on('connection', (socket) => {
  console.log(`User ${socket.id} connected`);

  /**
   * Code room events
   */
  socket.on('join-room', (data) => {
    const { roomId, user } = data;

    socket.join(roomId);

    const room = CodeRoomsState.rooms.find((room) => room.id === roomId);

    if (!room) {
      // the room does not exist
      io.to(roomId).emit('room-update', {
        status: false,
        message: 'Room does not exist',
        room: null,
      });
      return;
    }

    // join the room
    socket.join(roomId);

    // update the user's room
    CodeRoomsState.setRooms(
      CodeRoomsState.rooms.map((room) => {
        if (room.id === roomId) {
          return {
            ...room,
            users: [
              ...room.users.filter((u) => u._id !== user._id),
              { ...user, id: socket.id },
            ],
          };
        }
        return room;
      })
    );

    console.log('CodeRoomsState: <join room>', CodeRoomsState.rooms);

    // send the updated room to all users in the room
    io.to(roomId).emit('room-update', {
      status: true,
      message: 'Room joined',
      room: CodeRoomsState.rooms.find((room) => room.id === roomId),
    });
  });

  socket.on('leave-room', (data) => {
    const { roomId, user } = data;

    const room = CodeRoomsState.rooms.find((room) => room.id === roomId);

    if (!room) {
      // the room does not exist
      return;
    }

    socket.leave(roomId);

    // update the user's room
    CodeRoomsState.setRooms(
      CodeRoomsState.rooms.map((room) => {
        if (room.id === roomId) {
          return {
            ...room,
            users: room.users.filter((u) => u._id !== user._id),
          };
        }
        return room;
      })
    );

    console.log('CodeRoomsState: <leave room>', CodeRoomsState.rooms);

    // send the updated room to all users in the room
    io.to(roomId).emit('room-update', {
      status: true,
      room: CodeRoomsState.rooms.find((room) => room.id === roomId),
    });
  });

  // update the code in the room
  socket.on('update-code', (data) => {
    const { roomId, code } = data;

    // const room = CodeRoomsState.rooms.find((room) => room.id === roomId);

    // if (!room) {
    //   // the room does not exist
    //   return;
    // }

    // // update the code in the room
    // CodeRoomsState.setRooms(
    //   CodeRoomsState.rooms.map((room) => {
    //     if (room.id === roomId) {
    //       return {
    //         ...room,
    //         code,
    //       };
    //     }
    //     return room;
    //   })
    // );

    console.log('CodeRoomsState: <update code>', CodeRoomsState.rooms);

    // send the updated room to all users in the room
    socket.broadcast.to(roomId).emit('code-update', {
      code,
    });
  });

  // close the room
  socket.on('close-room', (data) => {
    const { roomId } = data;

    const room = CodeRoomsState.rooms.find((room) => room.id === roomId);

    if (!room) {
      // the room does not exist
      return;
    }

    // close the room
    CodeRoomsState.setRooms(
      CodeRoomsState.rooms.filter((room) => room.id !== roomId)
    );

    console.log('CodeRoomsState: <close room>', CodeRoomsState.rooms);

    // send the updated room to all users in the room
    io.to(roomId).emit('room-closed', {
      status: true,
      message: 'Room closed',
    });
  });

  // When user disconnects - to all others
  socket.on('disconnect', () => {
    const user = socket.id;

    // remove the user from the room
    CodeRoomsState.setRooms(
      CodeRoomsState.rooms.map((room) => {
        return {
          ...room,
          users: room.users.filter((u) => u.id !== user.id),
        };
      })
    );

    // get the room id
    const roomId = CodeRoomsState.rooms.find((room) =>
      room.users.some((u) => u.id === user.id)
    )?.id;

    console.log('CodeRoomsState: <disconnected room>', CodeRoomsState.rooms);

    // send the updated room to all users in the room
    io.to(roomId).emit('room-update', {
      status: true,
      room: CodeRoomsState.rooms.find((room) => room.id === roomId),
    });

    console.log(`User ${socket.id} disconnected`);
  });
});
