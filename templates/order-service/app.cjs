const http = require('node:http');

function createApp(store) {
  return http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json; charset=utf-8');
    // TODO: 检查方法与路径，实现订单和统计接口
    if (req.url === '/orders') {
      res.end(JSON.stringify(store.load()));
    } else {
      res.end(JSON.stringify({ total: 0 }));
    }
  });
}
module.exports = { createApp };
