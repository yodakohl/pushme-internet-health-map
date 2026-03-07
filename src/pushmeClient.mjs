function cleanBaseUrl(url) {
  return url.replace(/\/$/, '');
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!response.ok) {
    throw new Error(`PushMe request failed (${response.status}): ${JSON.stringify(body)}`);
  }
  return body;
}

export async function ensureSubscription(baseUrl, apiKey, eventType, topic = '') {
  const payload = {
    eventType
  };
  if (String(topic).trim()) {
    payload.topic = String(topic).trim();
  }
  return requestJson(`${cleanBaseUrl(baseUrl)}/api/bot/subscribe`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });
}

export async function fetchSubscribedEvents(baseUrl, apiKey, sinceId) {
  const url = new URL(`${cleanBaseUrl(baseUrl)}/api/bot/subscribed-events`);
  url.searchParams.set('sinceId', String(sinceId));
  url.searchParams.set('limit', '100');
  return requestJson(url.toString(), {
    method: 'GET',
    headers: {
      authorization: `Bearer ${apiKey}`
    }
  });
}
