import test from 'node:test';
import assert from 'node:assert/strict';
import { createMeteorConnection } from '../front/js/realtime-connection.js';
function fixture(transport = 'websocket') {
    const sockets = [], timers = new Map(), lifecycle = new Map(); let next = 0;
    class Socket {
        readyState = 0; handlers = new Map();
        constructor(url) { this.url = String(url); sockets.push(this); }
        addEventListener(name, handler) { this.handlers.set(name, handler); }
        trigger(name, data) { this.handlers.get(name)?.(data); }
        close() { this.readyState = 3; }
        send(value) { this.sent = value; }
    }
    const windowRef = { location: { href: 'https://example.com/showcase/elm', origin: 'https://example.com', hostname: 'example.com' }, WebSocket: Socket,
        setTimeout(fn) { timers.set(++next, fn); return next; }, clearTimeout(id) { timers.delete(id); },
        setInterval(fn) { timers.set(++next, fn); return next; }, clearInterval(id) { timers.delete(id); },
        addEventListener(name, fn) { lifecycle.set(name, fn); } };
    const documentRef = { querySelector(selector) { return { content: selector.includes('-transport') ? transport : '/realtime' }; } };
    return { windowRef, documentRef, sockets, timers, lifecycle };
}
test('native meteor connection validates and deduplicates frames without accepting an old socket', () => {
    const f = fixture(), events = [];
    const connection = createMeteorConnection(f).on('meteor', event => events.push(event));
    const a = f.sockets[0]; assert.equal(a.url, 'wss://example.com/realtime');
    a.readyState = 1; a.trigger('open');
    const frame = { type: 'meteor', id: 'one', payload: { color: '#abcdef', language: 'Elm', scale: 1 } };
    a.trigger('message', { data: JSON.stringify(frame) }); a.trigger('message', { data: JSON.stringify(frame) });
    a.trigger('message', { data: JSON.stringify({ ...frame, id: 'bad', payload: { ...frame.payload, scale: Infinity } }) });
    assert.equal(events.length, 1);
    f.lifecycle.get('pagehide')(); f.lifecycle.get('pageshow')();
    const b = f.sockets[1]; b.readyState = 1; b.trigger('open');
    a.trigger('close'); a.trigger('message', { data: JSON.stringify({ ...frame, id: 'stale' }) });
    b.trigger('message', { data: JSON.stringify({ ...frame, id: 'two' }) });
    assert.equal(events.length, 2); assert.equal(f.timers.size, 1);
    connection.disconnect(); assert.equal(f.timers.size, 0);
});
test('legacy Node deployment retains Socket.IO transport fallback', () => {
    const f = fixture('socket.io'); let endpoint, settings;
    const socket = { handlers: {}, io: { opts: {} }, on(name, fn) { this.handlers[name] = fn; } };
    const connection = createMeteorConnection({ ...f, io(url, options) { endpoint = url; settings = options; return socket; } });
    assert.equal(connection, socket); assert.equal(endpoint, 'https://example.com'); assert.deepEqual(settings.transports, ['websocket','polling']);
    socket.handlers.connect_error(); assert.deepEqual(socket.io.opts.transports, ['polling','websocket']);
});
