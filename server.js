const express = require('express');
const http = require('http');
const socketio = require('socket.io');
const mongoose = require('mongoose');

// =========================================================
// ИЗМЕНЕНИЕ ДЛЯ ХОСТИНГА: Используем переменную окружения
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

// 💡 НОВАЯ СХЕМА: Определение схемы пользователя для регистрации/входа
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true }, // Имя должно быть уникальным
  password: { type: String, required: true } // Пароль хранится в чистом виде (для простоты)
});
const User = mongoose.model('User', UserSchema); 
// ---------------------------------------------------------------------------------


// --- 2. НАСТРОЙКА СЕРВЕРА ---
const app = express();
const server = http.createServer(app);
const io = socketio(server); 

const PORT = process.env.PORT || 3000; 

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// --- 3. ЛОГИКА ЧАТА (WebSocket) ---
io.on('connection', async (socket) => {
  let currentUsername = 'Аноним'; 
  console.log('Новый пользователь подключился');

  // УДАЛЕНО: const CORRECT_PASSWORD = "mysecretpassword"; - Пароль теперь хранится в БД

  // Загрузка истории сообщений при подключении
  if (DB_URI) {
      try {
        const messages = await Message.find().sort({ timestamp: 1 }).limit(50);
        socket.emit('history', messages); 
      } catch (error) {
        console.error('Ошибка загрузки истории:', error);
      }
  }

  // 💡 НОВЫЙ ОБРАБОТЧИК: Проверка логина/пароля и регистрация
  socket.on('login', async ({ username, password }) => {
      if (!DB_URI) {
          socket.emit('login response', { success: false, message: "База данных недоступна. Авторизация невозможна." });
          return;
      }
      
      try {
          // 1. Ищем пользователя в базе
          const user = await User.findOne({ username: username });
          
          if (user) {
              // --- А. СУЩЕСТВУЮЩИЙ ПОЛЬЗОВАТЕЛЬ (Вход) ---
              if (user.password === password) {
                  currentUsername = username;
                  socket.emit('login response', { success: true, username: username });
              } else {
                  socket.emit('login response', { success: false, message: "Неверный пароль для этого имени." });
              }
          } else {
              // --- B. НОВЫЙ ПОЛЬЗОВАТЕЛЬ (Регистрация) ---
              if (password.length < 4) { 
                  socket.emit('login response', { success: false, message: "Пароль слишком короткий (минимум 4 символа)." });
                  return;
              }

              // Создаем и сохраняем нового пользователя
              const newUser = new User({ username: username, password: password });
              await newUser.save();
              
              currentUsername = username;
              socket.emit('login response', { success: true, username: username, isNew: true });
              
          }
      } catch (error) {
          console.error('Ошибка авторизации/регистрации:', error);
          socket.emit('login response', { success: false, message: "Произошла ошибка базы данных." });
      }
  });

  // 💡 ИСПРАВЛЕННЫЙ ОБРАБОТЧИК: Вызывается клиентом ТОЛЬКО после успешной авторизации
  socket.on('new user', () => {
      // Проверяем, что имя пользователя уже установлено
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