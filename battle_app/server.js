const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: '*' } });

// Serve static files
app.use(express.static(__dirname));
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// Room data: { roomId: { players: [{id, character}], battleState: {turn, hp, etc} } }
const rooms = {};

console.log('App created with love by Skye <3');

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Join room
  socket.on('joinRoom', (roomId) => {
    socket.join(roomId);
    if (!rooms[roomId]) {
      rooms[roomId] = { players: [], battleState: null };
    }
    rooms[roomId].players.push({ id: socket.id, character: null });
    io.to(roomId).emit('message', `${socket.id} joined the room.`);
    io.to(roomId).emit('updatePlayers', rooms[roomId].players);
  });

  // Fetch anime characters (Jikan API)
  socket.on('searchAnimeCharacter', async (query, callback) => {
    try {
      const res = await axios.get(`https://api.jikan.moe/v4/characters?q=${query}&limit=5`);
      const characters = res.data.data.map(char => ({
        id: char.mal_id,
        name: char.name,
        image: char.images.jpg.image_url,
        // Mock stats for fun
        stats: { 
          strength: Math.floor(Math.random() * 100) + 50, 
          speed: Math.floor(Math.random() * 100) + 50, 
          durability: Math.floor(Math.random() * 100) + 50,
          power: Math.floor(Math.random() * 100) + 50
        }
      }));
      callback(characters);
    } catch (err) {
      callback([]);
    }
  });

  // Mock comic characters (no API key needed)
  socket.on('searchComicCharacter', (query, callback) => {
    const allCharacters = [
      { id: 1, name: 'Superman', image: 'https://boundingintocomics.com/wp-content/uploads/144.png', stats: { strength: 100, speed: 100, durability: 100, power: 100 } },
      { id: 2, name: 'Batman', image: 'https://static0.srcdn.com/wordpress/wp-content/uploads/2024/02/detective-comics-1000-batman-joker-featured.jpg', stats: { strength: 80, speed: 70, durability: 90, power: 60 } },
      { id: 3, name: 'Spider-Man', image: 'https://cdn.marvel.com/content/1x/rek-rap_card.jpg', stats: { strength: 70, speed: 90, durability: 70, power: 80 } },
      { id: 4, name: 'Wonder Woman', image: 'https://media.wired.com/photos/59375829bef1fc4e58f94a0e/master/pass/GalleryComics_1920x1080_20170531_WW-Annual-1_5903bbd4d223b6.50778583.jpg', stats: { strength: 95, speed: 85, durability: 95, power: 90 } },
      { id: 5, name: 'Hulk', image: 'https://cdn.marvel.com/content/1x/hulkard_0.jpg', stats: { strength: 100, speed: 60, durability: 100, power: 95 } },
    ];
    const characters = allCharacters.filter(char => char.name.toLowerCase().includes(query.toLowerCase())).slice(0, 5);
    callback(characters);
  });

  // Select character
  socket.on('selectCharacter', (roomId, character) => {
    const player = rooms[roomId].players.find(p => p.id === socket.id);
    if (player) player.character = character;
    io.to(roomId).emit('updatePlayers', rooms[roomId].players);

    // Start battle if 2 players ready
    if (rooms[roomId].players.filter(p => p.character).length === 2) {
      const [p1, p2] = rooms[roomId].players;
      rooms[roomId].battleState = {
        turn: p1.id,
        hp: { [p1.id]: 200, [p2.id]: 200 }, // Higher HP for longer fun battles
        logs: []
      };
      io.to(roomId).emit('startBattle', rooms[roomId].battleState);
    }
  });

  // Battle action with type (basic/special)
  socket.on('attack', async (roomId, attackType) => {
    const state = rooms[roomId].battleState;
    if (state.turn !== socket.id) return;

    const attacker = rooms[roomId].players.find(p => p.id === socket.id);
    const defender = rooms[roomId].players.find(p => p.id !== socket.id);

    // Fun damage calc: base + type modifier
    let baseDamage = Math.max(0, attacker.character.stats.strength - defender.character.stats.durability / 2);
    const multiplier = attackType === 'special' ? 1.5 : 1;
    const damage = Math.floor(baseDamage * multiplier * (Math.random() * 0.5 + 0.75)); // Random variance for fun
    state.hp[defender.id] -= damage;
    state.logs.push(`${attacker.character.name} used ${attackType} attack on ${defender.character.name} for ${damage} damage!`);

    // Fetch fun animation GIF based on attack
    const actions = ['punch', 'kick', 'bonk', 'smug']; // Fun SFW categories from waifu.pics
    const action = actions[Math.floor(Math.random() * actions.length)];
    const gifRes = await axios.get(`https://api.waifu.pics/sfw/${action}`);
    state.logs.push({ animation: gifRes.data.url });

    // Random fun event: 10% chance for power-up
    if (Math.random() < 0.1) {
      state.hp[socket.id] += 20;
      state.logs.push(`Lucky! ${attacker.character.name} got a power-up (+20 HP)!`);
    }

    // Check win
    if (state.hp[defender.id] <= 0) {
      io.to(roomId).emit('battleEnd', `${attacker.character.name} wins! 🎉`);
      rooms[roomId].battleState = null; // Reset for repeatability
      return;
    }

    // Next turn
    state.turn = defender.id;
    io.to(roomId).emit('updateBattle', state);
  });

  // Restart battle
  socket.on('restartBattle', (roomId) => {
    rooms[roomId].battleState = null;
    rooms[roomId].players.forEach(p => p.character = null);
    io.to(roomId).emit('restart');
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    // Clean up rooms (simple: remove empty)
    Object.keys(rooms).forEach(roomId => {
      rooms[roomId].players = rooms[roomId].players.filter(p => p.id !== socket.id);
      if (rooms[roomId].players.length === 0) delete rooms[roomId];
    });
  });
});

const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`Server running on port ${port} | Credits: Skye <3`));
