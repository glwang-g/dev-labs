export function casesFor(id) {
  const paid = (amount, customer = 'Ada') => ({ amount, customer, status: 'paid' });
  const cancelled = (amount, customer = 'Lin') => ({ amount, customer, status: 'cancelled' });
  if (id === 's1-total') return [
    { name: '空订单', args: [[]], expected: 0 },
    { name: '混合订单', args: [[paid(1200), cancelled(9000), paid(800)]], expected: 2000 },
    { name: '全部取消', args: [[cancelled(9900)]], expected: 0 },
    { name: '零金额与不同数据', args: [[paid(0), paid(731), paid(269)]], expected: 1000 }
  ];
  if (id === 's1-group') return [
    { name: '空订单', args: [[]], expected: {} },
    { name: '重复客户与取消订单', args: [[paid(1200), paid(800), paid(500, 'Lin'), cancelled(3000)]], expected: { Ada: 2000, Lin: 500 } },
    { name: '取消客户不建条目', args: [[cancelled(3000, 'Only')]], expected: {} },
    { name: '客户名也是普通数据', args: [[paid(70, '__proto__'), paid(30, '__proto__'), paid(20, 'constructor')]], expected: JSON.parse('{"__proto__":100,"constructor":20}') }
  ];
  if (id === 's1-transfer') return [
    { name: '空输入', args: [[], 100], expected: 0 },
    { name: '等于门槛也符合', args: [[paid(100), paid(99), cancelled(500), paid(101)], 100], expected: 2 },
    { name: '零门槛', args: [[paid(0), cancelled(200)], 0], expected: 1 },
    { name: '更换门槛与金额', args: [[paid(750), paid(800), paid(1000)], 900], expected: 1 }
  ];
  return [];
}
