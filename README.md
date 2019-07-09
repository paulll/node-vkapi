# node-vkapi
Быстрый клиент для API Вконтакте.

### Особенности

- Упаковка запросов в Execute
- Автоматическая загрузка списков (где поля items, count)
- Параллельные запросы и ограничение количества запросов в обработке
- Приоритезация запросов
- Повтор запроса при ошибке или таймауте
- Троттлинг запросов с access_token
- Использование access_token как fallback при обращении с service_token

### Установка
```bash
npm i -S @paulll/vklib
```

### Пример

```typescript
const api = new API({ access_token, service_token });
const friends = await api.fetch('friends.get', {user_id: 0, fields: 'photo_max'});
const me = (await api.fetch('users.get', {user_ids: 0}, {priority: 10}))[0];
```
