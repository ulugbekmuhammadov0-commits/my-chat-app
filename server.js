const express = require('express');
const http = require = require('http');
const socketio = require('socket.io');
const mongoose = require('mongoose');

// =========================================================
const DB_URI = process.env.MONGO_URI; 
// =========================================================

// --- 1. НАСТРОЙКА БАЗЫ ДАННЫХ ---
if (DB_URI) {
    mongoose.connect(DB_URI)
      .then(() => console.log('Подключение к MongoDB успешно!'))
      .catch(err => console.error('Ошибка подключения к БД:', err));
} else {
    console.error('Ошибка: Переменная окружения MONGO_URI не установлена. БД не подключена.');
}

// Определение схемы сообщения
const MessageSchema = new mongoose.Schema({
  username: String,
  text: String,
  timestamp: { type: Date, default: Date.now }
});
const Message = mongoose.model('Message', MessageSchema); 

// 🛑 УДАЛЕНА СХЕМА USER

// --- 2. НАСТРОЙКА СЕРВЕРА ---
const app = express();
const server = http.createServer(app);
const io = socketio(server); 

const PORT = process.env.PORT || 3000; 

// 🛑 УДАЛЕН РОУТ app.get('/users', ...)

// Обслуживание нашего HTML файла
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// --- 3. ЛОГИКА ЧАТА (WebSocket) ---
io.on('connection', async (socket) => {
  let currentUsername = 'Аноним'; 
  console.log('Новый пользователь подключился');

  // Загрузка истории сообщений при подключении
  if (DB_URI) {
      try {
        const messages = await Message.find().sort({ timestamp: 1 }).limit(50);
        socket.emit('history', messages); 
      } catch (error) {
        console.error('Ошибка загрузки истории:', error);
      }
  }

  // 💡 ВОССТАНОВЛЕН СТАРЫЙ ОБРАБОТЧИК: Прием только имени пользователя
  socket.on('new user', (name) => {
      currentUsername = name;
      // Отправляем всем (включая нового пользователя) системное сообщение
      io.emit('chat message', { 
        username: 'Система', 
        text: `**${currentUsername}** вошел в чат.`, 
        timestamp: new Date()
      });
  });

  // 🛑 УДАЛЕН ОБРАБОТЧИК 'login'

  // Обработка входящих сообщений от клиента
  socket.on('chat message', async (msgText) => {
    const newMessage = { 
      username: currentUsername, 
      text: msgText, 
      timestamp: new Date()
    };

    // Сохраняем сообщение в БД
    if (DB_URI) {
        try {
            const messageDoc = new Message(newMessage);
            await messageDoc.save();
        } catch (error) {
            console.error('Ошибка сохранения сообщения:', error);
        }
    }
    
    // Отправляем сообщение ВСЕМ КРОМЕ ОТПРАВИТЕЛЯ
    socket.broadcast.emit('chat message', newMessage); 
  });

  // Обработка отключения
  socket.on('disconnect', () => {
    if (currentUsername !== 'Аноним') {
        io.emit('chat message', { 
            username: 'Система', 
            text: `**${currentUsername}** покинул чат.`, 
            timestamp: new Date()
        });
    }
  });
});

// --- 4. ЗАПУСК СЕРВЕРА ---
server.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});