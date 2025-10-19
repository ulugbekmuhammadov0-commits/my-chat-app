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
  
  // Обработка входящих сообщений от клиента (Остается без изменений)
  socket.on('chat message', async (msgText) => {
    // ... (весь код, который был здесь, остается прежним)
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

  // Обработка отключения (Остается без изменений)
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