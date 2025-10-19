const express = require('express');
const http = require('http');
const socketio = require('socket.io');
const mongoose = require('mongoose');

// =========================================================
// ИЗМЕНЕНИЕ ДЛЯ ХОСТИНГА: Используем переменную окружения
// СТРОКА ПОДКЛЮЧЕНИЯ БУДЕТ УСТАНОВЛЕНА НА СЕРВЕРЕ (например, Render)
const DB_URI = process.env.MONGO_URI; 
// =========================================================

// --- 1. НАСТРОЙКА БАЗЫ ДАННЫХ ---
// Если переменная MONGO_URI установлена, подключаемся к MongoDB
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

// --- 2. НАСТРОЙКА СЕРВЕРА ---
const app = express();
const server = http.createServer(app);
const io = socketio(server); 

// ИЗМЕНЕНИЕ ДЛЯ ХОСТИНГА: Используем порт, предоставляемый хостингом, или 3000 локально
const PORT = process.env.PORT || 3000; 

// Обслуживание нашего HTML файла
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// --- 3. ЛОГИКА ЧАТА (WebSocket) ---
io.on('connection', async (socket) => {
  let currentUsername = 'Аноним'; 
  console.log('Новый пользователь подключился');

  // Загрузка истории сообщений при подключении (только если БД подключена)
  if (DB_URI) {
      try {
        const messages = await Message.find().sort({ timestamp: 1 }).limit(50);
        socket.emit('history', messages); 
      } catch (error) {
        console.error('Ошибка загрузки истории:', error);
      }
  }

  // Прием имени от клиента
  socket.on('new user', (name) => {
      currentUsername = name;
      // Отправляем всем (включая нового пользователя) системное сообщение
      io.emit('chat message', { 
        username: 'Система', 
        text: `**${currentUsername}** вошел в чат.`, 
        timestamp: new Date()
      });
  });
  
  // Обработка входящих сообщений от клиента
  socket.on('chat message', async (msgText) => {
    const newMessage = { 
      username: currentUsername, 
      text: msgText, 
      timestamp: new Date()
    };

    // Сохраняем сообщение в БД (только если БД подключена)
    if (DB_URI) {
        try {
            const messageDoc = new Message(newMessage);
            await messageDoc.save();
        } catch (error) {
            console.error('Ошибка сохранения сообщения:', error);
        }
    }
    
    // 🚀 КЛЮЧЕВОЕ ИЗМЕНЕНИЕ: Отправляем сообщение ВСЕМ КРОМЕ ОТПРАВИТЕЛЯ
    // Отправитель уже добавил его себе в браузере
    socket.broadcast.emit('chat message', newMessage); 
  });

  // Обработка отключения
  socket.on('disconnect', () => {
    io.emit('chat message', { 
        username: 'Система', 
        text: `**${currentUsername}** покинул чат.`, 
        timestamp: new Date()
    });
  });
});

// --- 4. ЗАПУСК СЕРВЕРА ---
server.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});