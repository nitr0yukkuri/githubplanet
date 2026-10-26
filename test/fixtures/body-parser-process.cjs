const express = require('express');

const app = express();
app.use(express.json({
    limit: '50mb',
    verify(req, _res, buffer) { req.rawBody = buffer; }
}));
app.post('/probe', (req, res) => {
    process.send({ event: 'parsed' });
    const respond = () => res.json(req.body);
    if (req.complete) respond();
    else req.once('end', respond);
});
app.get('/health', (_req, res) => res.send('OK'));
app.use((error, _req, res, _next) => res.status(error.status || 500).send('Rejected'));
const server = app.listen(0, '127.0.0.1', () => {
    process.send({ event: 'ready', port: server.address().port });
});
process.on('disconnect', () => server.close());
