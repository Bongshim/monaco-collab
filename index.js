import express from 'express';
import { Server } from 'socket.io';

const PORT = process.env.PORT || 3500;
const ADMIN = 'Admin';

const app = express();

const expressServer = app.listen(PORT, () => {
  console.log(`listening on port ${PORT}`);
});

// state
const UsersState = {
  users: [],
  setUsers: function (newUsersArray) {
    this.users = newUsersArray;
  },
};

const ActiveRidesState = {
  rides: [],
  setRides: function (newRidesArray) {
    this.rides = newRidesArray;
  },
};

const io = new Server(expressServer, {
  cors: {
    origin: '*',
  },
});

io.on('connection', (socket) => {
  console.log(`User ${socket.id} connected`);

  const userId = socket.handshake.query.userId;

  // This event listens for users to go live
  socket.on('go-live', (data) => {
    const { name, type } = data;
    activateUser(socket.id, name, type, userId);
  });
  /**
   * Driver events
   **/

  // This event listens for if the driver is live and send the status back to him
  socket.on('ready', () => {
    const user = getUser(socket.id);

    if (user) {
      io.to(socket.id).emit('status', {
        data: user,
      });
    }
  });

  // This event listens for a driver to accept a rider
  socket.on('accept', (data) => {
    const { riderId } = data;

    //  set active ride
    const ride = updateRide({
      driverId: socket.id,
      riderId,
      rideStatus: 'accepted',
      driverLocation: 'abuja 900211',
    });

    // Generate a unique identifier for the ride, e.g., a combination of driver and rider IDs
    const rideId = `${ride.driverId}-${ride.riderId}`;
    socket.join(rideId); // Driver joins the ride room
    io.to(riderId).socketsJoin(rideId); // Rider joins the same ride room

    // Then, emit an event to this room whenever there are updates to this ride
    io.to(rideId).emit('rideUpdate', { ride });

    console.log(ride);
  });

  /**
   * Rider events
   */
  // This event listens for a rider to request active drivers
  socket.on('find-drivers', () => {
    console.log(UsersState.users);
    // get all drivers
    const drivers = UsersState.users.filter(
      (user) => user.userType === 'drivers'
    );

    // send drivers to rider
    io.to(socket.id).emit('drivers', {
      drivers,
    });
  });

  // This event listens for a rider to request a driver
  socket.on('request-driver', (data) => {
    const { driverId } = data;
    const driver = getUser(driverId);
    console.log(driver);
    if (driver) {
      io.to(driverId).emit('driver-request', {
        rider: getUser(socket.id),
      });
    }
  });

  /**
   * Update ride status or location
   */
  socket.on('update-ride', (data) => {
    const { driverId, riderId, ...others } = data;

    // Update ride
    updateRide(data);
  });

  // When user disconnects - to all others
  socket.on('disconnect', () => {
    const user = getUser(socket.id);
    userLeavesApp(socket.id);

    if (user) {
      io.to(user.room).emit(
        'message',
        buildMsg(ADMIN, `${user.name} has left the room`)
      );

      io.to(user.room).emit('userList', {
        users: getUsersInRoom(user.room),
      });

      io.emit('roomList', {
        rooms: getAllActiveRooms(),
      });
    }

    console.log(`User ${socket.id} disconnected`);
  });
});

function buildMsg(name, text) {
  return {
    name,
    text,
    time: new Intl.DateTimeFormat('default', {
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    }).format(new Date()),
  };
}

// User functions
function activateUser(id, name, userType, userId) {
  const user = { id, name, userType, userId };
  UsersState.setUsers([
    ...UsersState.users.filter((user) => user.id !== id),
    user,
  ]);
  return user;
}

/**
 * Update ride
 * @param {object} data
 * @param {string} data.driverId
 * @param {string} data.riderId
 * @param {string} data.pickupLocation
 * @param {string} data.rideDestination
 * @param {string} data.rideStatus
 * @param {string} data.driverLocation
 * @returns
 */
function updateRide(data) {
  let ride = {};
  const { driverId, riderId } = data;

  const otherRides = ActiveRidesState.rides.filter(
    (r) => r.driver.id !== driverId
  );

  const currentRide = ActiveRidesState.rides.find(
    (ride) => ride.driver.id === driverId
  );

  if (!currentRide) {
    ride = {
      driver: getUser(driverId),
      rider: getUser(riderId),
      ...data,
    };
  } else {
    ride = {
      ...currentRide,
      ...data,
    };
  }

  ActiveRidesState.setRides([...otherRides, ride]);

  const rideId = `${driverId}-${riderId}`;
  io.to(rideId).emit('rideUpdate', { ride });
  return ride;
}

function userLeavesApp(id) {
  UsersState.setUsers(UsersState.users.filter((user) => user.id !== id));
}

function getUser(id) {
  return UsersState.users.find((user) => user.id === id);
}

function getUsersInRoom(room) {
  return UsersState.users.filter((user) => user.room === room);
}

function getAllActiveRooms() {
  return Array.from(new Set(UsersState.users.map((user) => user.room)));
}
