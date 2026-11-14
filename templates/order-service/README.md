# 订单服务 · 交付练习

运行环境：Node.js 25.8 或以上。只使用 Node 内置模块，无需安装依赖。

## 启动

运行 `npm start`，打开 http://127.0.0.1:4318/orders 。

## 验证

运行 `npm test`。持久化测试使用临时目录，HTTP 测试实际启动本机服务器并发出请求。

## 接口契约

- GET /orders：返回 paid 订单数组。
- GET /summary：返回 { total: 已支付订单金额合计 }，单位为分。
- 未知路径返回 404；非 GET 方法返回 405。
- store.load()：不存在的文件返回 []；损坏 JSON 抛错。
- store.save(orders)：写入 JSON，新实例应能读回相同数据。

## 我的修改

TODO：解释改动原因、复现方法、验证步骤，以及尚未处理的情况。
