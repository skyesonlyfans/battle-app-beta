const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const axios = require('axios');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: '*' } });

// Mock comic characters (no API key needed)
const mockComicCharacters = [
  { id: 1, name: 'Superman', image: 'https://www.superherodb.com/pictures/portraits/10/50/791.jpg', stats: { strength: 100, speed: 100, durability: 100, power: 100 } },
  { id: 2, name: 'Batman', image: 'https://www.superherodb.com/pictures/portraits/10/50/639.jpg', stats: { strength: 18, speed: 27, durability: 42, power: 37 } },
  { id: 3, name: 'Spider-Man', image: 'https://www.superherodb.com/pictures/portraits/10/50/133.jpg', stats: { strength: 55, speed: 67, durability: 74, power: 58 } },
  { id: 4, name: 'Wonder Woman', image: 'https://www.superherodb.com/pictures/portraits/10/50/807.jpg', stats: { strength: 100, speed: 79, durability: 100, power: 90 } },
  { id: 5, name: 'Hulk', image: 'https://www.superherodb.com/pictures/portraits/10/50/226.jpg', stats: { strength: 100, speed: 63, durability: 100, power: 98 } }
];

// Room data
const rooms = {};

console.log('App created with love by Skye <3');

app.use(express.static(path.join(__dirname, '.')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('joinRoom', (roomId) => {
    socket.join(roomId);
    if (!rooms[roomId]) {
      rooms[roomId] = { players: [], battleState: null };
    }
    rooms[roomId].players.push({ id: socket.id, character: null });
    io.to(roomId).emit('message', `${socket.id} joined the room.`);
    io.to(roomId).emit('updatePlayers', rooms[roomId].players);
  });

  socket.on('searchAnimeCharacter', async (query, callback) => {
    try {
      const res = await axios.get(`https://api.jikan.moe/v4/characters?q=${query}&limit=5`);
      const characters = res.data.data.map(char => ({
        id: char.mal_id,
        name: char.name,
        image: char.images.jpg.image_url,
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

  socket.on('searchComicCharacter', (query, callback) => {
    const filtered = mockComicCharacters.filter(char => char.name.toLowerCase().includes(query.toLowerCase()));
    callback(filtered);
  });

  socket.on('selectCharacter', (roomId, character) => {
    const player = rooms[roomId].players.find(p => p.id === socket.id);
    if (player) player.character = character;
    io.to(roomId).emit('updatePlayers', rooms[roomId].players);

    if (rooms[roomId].players.filter(p => p.character).length === 2) {
      const [p1, p2] = rooms[roomId].players;
      rooms[roomId].battleState = {
        turn: p1.id,
        hp: { [p1.id]: 200, [p2.id]: 200 },
        logs: []
      };
      io.to(roomId).emit('startBattle', rooms[roomId].battleState);
    }
  });

  socket.on('attack', async (roomId, attackType) => {
    const state = rooms[roomId].battleState;
    if (state.turn !== socket.id) return;

    const attacker = rooms[roomId].players.find(p => p.id === socket.id);
    const defender = rooms[roomId].players.find(p => p.id !== socket.id);

    let baseDamage = Math.max(0, attacker.character.stats.strength - defender.character.stats.durability / 2);
    const multiplier = attackType === 'special' ? 1.5 : 1;
    const damage = Math.floor(baseDamage * multiplier * (Math.random() * 0.5 + 0.75));
    state.hp[defender.id] -= damage;
    state.logs.push(`${attacker.character.name} used ${attackType} attack on ${defender.character.name} for ${damage} damage!`);

    const actions = ['punch', 'kick', 'bonk', 'smug'];
    const action = actions[Math.floor(Math.random() * actions.length)];
    const gifRes = await axios.get(`https://api.waifu.pics/sfw/${action}`);
    state.logs.push({ animation: gifRes.data.url });

    if (Math.random() < 0.1) {
      state.hp[socket.id] += 20;
      state.logs.push(`Lucky! ${attacker.character.name} got a power-up (+20 HP)!`);
    }

    if (state.hp[defender.id] <= 0) {
      io.to(roomId).emit('battleEnd', `${attacker.character.name} wins! 🎉`);
      rooms[roomId].battleState = null;
      return;
    }

    state.turn = defender.id;
    io.to(roomId).emit('updateBattle', state);
  });

  socket.on('restartBattle', (roomId) => {
    rooms[roomId].battleState = null;
    rooms[roomId].players.forEach(p => p.character = null);
    io.to(roomId).emit('restart');
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    Object.keys(rooms).forEach(roomId => {
      rooms[roomId].players = rooms[roomId].players.filter(p => p.id !== socket.id);
      if (rooms[roomId].players.length === 0) delete rooms[roomId];
    });
  });
});

const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`Server running on port ${port} | Credits: Skye <3`));