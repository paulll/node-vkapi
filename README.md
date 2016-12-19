# node-vkapi
Fast, simple, asynchronous, Promise-based vk.com API client.

### Usage
```javascript
const vk = require('vkapi');

// if set, request will be enqueued to avoid hitting api request limits
const token = null; 

vk.request('users.get', {user_ids: '1,2,3'}, token)
.then(users => {
  for (let user of users)
    console.log(`${user.first_name} ${user.last_name}`);
})
.catch(error => {
  if (error.error_msg)
    return console.log(`API exception: ${error.error_msg}`);
  console.log(`Unknown exception: ${error.message}`)
});
```
