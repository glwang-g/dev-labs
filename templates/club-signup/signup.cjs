function signUp(event, name) {
  if (event.confirmed.length + 1 < event.capacity) {
    return { ...event, confirmed: [...event.confirmed, name] };
  }
  return { ...event, waiting: [...event.waiting, name] };
}

function cancel(event, name) {
  return {
    ...event,
    confirmed: event.confirmed.filter(person => person !== name)
  };
}

if (typeof module !== 'undefined') module.exports = { signUp, cancel };
