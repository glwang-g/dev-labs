const path = require('node:path');
const { createStore } = require('./store.cjs');
const { createApp } = require('./app.cjs');
const store = createStore(path.join(__dirname, 'data', 'orders.json'));
createApp(store).listen(4318, '127.0.0.1', () => console.log('订单服务：http://127.0.0.1:4318/orders'));
