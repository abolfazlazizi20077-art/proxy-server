const http = require('http');
const https = require('https');
const url = require('url');

const PROXY_USER = 'fund6user';
const PROXY_PASS = 'fund6pass123';

http.createServer((req, res) => {
    const auth = req.headers['proxy-authorization'];
    const expected = 'Basic ' + Buffer.from(PROXY_USER + ':' + PROXY_PASS).toString('base64');
    if (!auth || auth !== expected) {
        res.writeHead(407);
        res.end('Proxy Auth Required');
        return;
    }

    const target = url.parse(req.url);
    const options = {
        hostname: target.hostname,
        port: target.port || 443,
        path: target.path,
        method: req.method,
        headers: { ...req.headers }
    };
    delete options.headers['proxy-authorization'];
    delete options.headers['proxy-connection'];

    const proxyReq = (target.protocol === 'https:' ? https : http).request(options, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
    });

    proxyReq.on('error', (e) => {
        res.writeHead(500);
        res.end('Proxy Error: ' + e.message);
    });

    req.pipe(proxyReq);
}).listen(process.env.PORT || 8080, () => {
    console.log('Proxy running');
});
