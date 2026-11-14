const fs = require('node:fs');

function createStore(file) {
  return {
    load() {
      // TODO: 读取 JSON；仅文件不存在时返回 []
      return [];
    },
    save(orders) {
      // TODO: 将订单数组写入 file
    }
  };
}
module.exports = { createStore };
