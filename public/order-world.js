export const WORLD_VERSION = 'orders-1';
export function initialWorld(orders, includeCancelled = false) {
  if (!Array.isArray(orders) || orders.length > 30 || orders.some(o => !Number.isSafeInteger(o.amount) || o.amount < 0 || o.amount > 1e8 || !['paid','cancelled'].includes(o.status))) throw new Error('订单数据不符合场景范围');
  return { version: WORLD_VERSION, orders: structuredClone(orders), includeCancelled: Boolean(includeCancelled), cursor: 0, total: 0, ledger: [] };
}
export function advanceWorld(state, action) {
  if (state.version !== WORLD_VERSION || action.type !== 'process') throw new Error('未知的世界版本或行动');
  if (state.cursor >= state.orders.length) throw new Error('订单已经处理完毕');
  const next = structuredClone(state), order = next.orders[next.cursor];
  const included = order.status === 'paid' || next.includeCancelled;
  const before = next.total;
  if (included) next.total += order.amount;
  next.cursor++;
  const event = { tick: next.cursor, action: 'process', order: structuredClone(order), before, after: next.total, included, prediction: action.prediction ?? null, predictionMatched: action.prediction == null ? null : action.prediction === next.total, reason: included ? '订单被计入，营业额增加 ' + order.amount + ' 分' : '订单已取消，营业额保持不变' };
  next.ledger.push(event);
  return { state: next, event };
}
export function replayWorld(session, cursor = session.actions.length) {
  if (!Number.isInteger(cursor) || cursor < 0 || cursor > session.actions.length) throw new Error('回放位置超出范围');
  let state = structuredClone(session.initial);
  for (const action of session.actions.slice(0,cursor)) state = advanceWorld(state, action).state;
  return state;
}
export function evaluateWorld(state) {
  const expected = state.orders.slice(0,state.cursor).filter(o=>o.status==='paid').reduce((s,o)=>s+o.amount,0);
  return { finished: state.cursor === state.orders.length, correct: state.total === expected, expected, actual: state.total };
}
