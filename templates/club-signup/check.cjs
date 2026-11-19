const assert = require('node:assert/strict');
const { signUp, cancel } = require('./signup.cjs');
const lastSeat = { capacity: 2, confirmed: ['阿青'], waiting: [] };
assert.deepEqual(signUp(lastSeat, '小林'), {
  ...lastSeat, confirmed: ['阿青', '小林']
});
const regression = require('./regression.json');
assert.deepEqual(cancel(...regression.args), regression.expected);
console.log('报名边界与取消递补反例均通过');
