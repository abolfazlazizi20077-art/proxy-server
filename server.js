const http = require('http');
const https = require('https');
const net = require('net');
const url = require('url');

const PROXY_USER = 'fund6user';
const PROXY_PASS = 'fund6pass123';

function checkAuth(req) {
    const auth = req.headers['proxy-authorization'];
    const expected = 'Basic ' + Buffer.from(PROXY_USER + ':' + PROXY_PASS).toString('base64');
    return auth === expected;
}

const server = http.createServer((req, res) => {
    if (!checkAuth(req)) {
        res.writeHead(407, { 'Proxy-Authenticate': 'Basic realm="proxy"' });
        res.end('Proxy Auth Required');
        return;
    }

    const target = url.parse(req.url);
    const options = {
        hostname: target.hostname,
        port: target.port || 80,
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
});

// HTTPS CONNECT (tunnel)
server.on('connect', (req, clientSocket, head) => {
    const auth = req.headers['proxy-authorization'];
    const expected = 'Basic ' + Buffer.from(PROXY_USER + ':' + PROXY_PASS).toString('base64');

    if (auth !== expected) {
        clientSocket.write('HTTP/1.1 407 Proxy Authentication Required\r\n' +
            'Proxy-Authenticate: Basic realm="proxy"\r\n\r\n');
        clientSocket.end();
        return;
    }

    const [host, port] = req.url.split(':');
    const serverSocket = net.connect(port || 443, host, () => {
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        serverSocket.write(head);
        serverSocket.pipe(clientSocket);
        clientSocket.pipe(serverSocket);
    });

    serverSocket.on('error', (err) => {
        clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
        clientSocket.end();
    });

    clientSocket.on('error', () => {
        serverSocket.end();
    });
});

server.listen(process.env.PORT || 8080, () => {
    console.log('Proxy running with CONNECT support');
});
