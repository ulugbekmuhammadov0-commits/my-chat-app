const express = require('express');
const http = require('http');
const socketio = require('socket.io');
const mongoose = require('mongoose');

// =========================================================
// ИЗМЕНЕНИЕ ДЛЯ ХОСТИНГА: Используем переменную окружения
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
const io = socketio(server); // 💡 ОБЪЯВЛЕН объект io

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

  // Установите здесь свой секретный пароль!
  const CORRECT_PASSWORD = "mysecretpassword"; 

  // Загрузка истории сообщений при подключении (только если БД подключена)
  if (DB_URI) {
      try {
        const messages = await Message.find().sort({ timestamp: 1 }).limit(50);
        socket.emit('history', messages); 
      } catch (error) {
        console.error('Ошибка загрузки истории:', error);
      }
  }

  // 💡 НОВЫЙ ОБРАБОТЧИК: Проверка логина и пароля
  socket.on('login', ({ username, password }) => {
      if (password === CORRECT_PASSWORD) {
          // Успешный вход: сохраняем имя
          currentUsername = username;
          
          // Отправляем клиенту, что вход успешен
          socket.emit('login response', { success: true, username: username });

      } else {
          // Ошибка входа
          socket.emit('login response', { success: false, message: "Неверный пароль." });
      }
  });

  // 💡 ИСПРАВЛЕННЫЙ ОБРАБОТЧИК: Вызывается клиентом ТОЛЬКО после успешной авторизации
  socket.on('new user', () => {
      // Проверяем, что имя пользователя уже установлено (после успешного 'login')
      if (currentUsername !== 'Аноним') {
          io.emit('chat message', { 
              username: 'Система', 
              text: `**${currentUsername}** вошел в чат.`, 
              timestamp: new Date()
          });
      }
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
    
    // Отправляем сообщение ВСЕМ КРОМЕ ОТПРАВИТЕЛЯ
    socket.broadcast.emit('chat message', newMessage); 
  });

  // Обработка отключения
  socket.on('disconnect', () => {
    // Проверяем, что пользователь успел представиться
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