import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import { gzipSync } from 'node:zlib';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

function waitForMessage(child, event) {
    return new Promise((resolve, reject) => {
        const cleanup = () => {
            child.off('message', onMessage);
            child.off('exit', onExit);
            child.off('error', onError);
        };
        const onMessage = (message) => {
            if (message.event !== event) return;
            cleanup();
            resolve(message);
        };
        const onExit = (code) => { cleanup(); reject(new Error(`Parser process exited early (${code})`)); };
        const onError = (error) => { cleanup(); reject(error); };
        child.on('message', onMessage);
        child.once('exit', onExit);
        child.once('error', onError);
    });
}

test('keeps serving after trailing bytes reach a finished compressed request decoder', { timeout: 15_000 }, async (t) => {
    const child = spawn(process.execPath, [fileURLToPath(new URL('./fixtures/body-parser-process.cjs', import.meta.url))], {
        stdio: ['ignore', 'ignore', 'ignore', 'ipc']
    });
    t.after(async () => {
        if (child.exitCode === null && child.signalCode === null) {
            const exited = once(child, 'exit');
            child.kill();
            await exited;
        }
    });
    const { port } = await waitForMessage(child, 'ready');

    // GHSA-27r3-jxmh-p828は、正常フレームの解析後に残りの圧縮データが届いたときだけ再現する。
    const first = Buffer.concat([gzipSync(Buffer.from('{"a":1}')), Buffer.from([0])]);
    const trailing = Buffer.alloc(100 * 1024, 0x58);
    const socket = net.createConnection({ host: '127.0.0.1', port });
    t.after(() => socket.destroy());
    await once(socket, 'connect');
    const chunks = [];
    socket.on('data', (chunk) => chunks.push(chunk));
    const closed = once(socket, 'close');
    const parsed = waitForMessage(child, 'parsed');
    socket.write([
        'POST /probe HTTP/1.1', 'Host: localhost', 'Content-Type: application/json',
        'Content-Encoding: gzip', `Content-Length: ${first.length + trailing.length}`,
        'Connection: close', '', ''
    ].join('\r\n'));
    socket.write(first);
    await parsed;
    socket.end(trailing);
    await closed;
    assert.match(Buffer.concat(chunks).toString(), /HTTP\/1\.1 200/);
    assert.match(Buffer.concat(chunks).toString(), /\{"a":1\}/);

    const baseUrl = `http://127.0.0.1:${port}`;
    const healthy = await fetch(`${baseUrl}/health`);
    assert.equal(await healthy.text(), 'OK');
    const normal = await fetch(`${baseUrl}/probe`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'content-encoding': 'gzip' },
        body: gzipSync(Buffer.from('{"normal":true}'))
    });
    assert.equal(normal.status, 200);
    assert.deepEqual(await normal.json(), { normal: true });
    assert.equal(child.exitCode, null);
});
