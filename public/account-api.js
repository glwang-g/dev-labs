export let session = {enabled:false};
export function useSession(value) { session = value; }
export function apiFetch(url, options = {}) {
  const headers = new Headers(options.headers);
  if (session.principal) headers.set('x-devlabs-account', session.principal.id);
  if (session.learnerId) headers.set('x-devlabs-learner', session.learnerId);
  return fetch(url, {...options, headers});
}
