import * as http from 'node:http';
import * as https from 'node:https';

// Used only after Instagram host/protocol checks, with checked lookup on every
// new connection. Reusing an already pinned socket never performs a new lookup.
const options = {keepAlive: true, maxSockets: 4, maxTotalSockets: 12, maxFreeSockets: 2, scheduling: 'lifo' as const};
const agents = {http: new http.Agent(options), https: new https.Agent(options)};
for (const agent of Object.values(agents)) {
  agent.on('free', socket => socket.setTimeout(5000));
}
export function instagramAgent(protocol: string) { return protocol === 'https:' ? agents.https : agents.http; }
export function resetActiveSocketTimeout(request: http.ClientRequest) {
  // The 5s free-socket lifetime must never shorten an active request's deadline.
  request.on('socket', socket => socket.setTimeout(0));
}
