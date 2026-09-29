const http = require('http');
const https = require('https');
const net = require('net');
const url = require('url');

const PROXY_USER = 'fund6user';
const PROXY_PASS = 'fund6pass123';
const PORT = process.env.PORT || 8080;

function isAuthorized(headerValue) {
    const expected = 'Basic ' + Buffer.from(PROXY_USER + ':' + PROXY_PASS).toString('base64');
    return headerValue === expected;
}

const server = http.createServer((req, res) => {
    if (!isAuthorized(req.headers['proxy-authorization'])) {
        res.writeHead(407, { 'Proxy-Authenticate': 'Basic realm="proxy"' });
        res.end('Proxy Auth Required');
        return;
    }

    let target;
    try {
        target = new URL(req.url);
    } catch (e) {
        res.writeHead(400);
        res.end('Bad URL');
        return;
    }

    const options = {
        hostname: target.hostname,
        port: target.port || (target.protocol === 'https:' ? 443 : 80),
        path: target.pathname + target.search,
        method: req.method,
        headers: { ...req.headers }
    };
    delete options.headers['proxy-authorization'];
    delete options.headers['proxy-connection'];
    delete options.headers['host'];

    const lib = target.protocol === 'https:' ? https : http;
    const proxyReq = lib.request(options, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
    });

    proxyReq.on('error', (e) => {
        res.writeHead(502);
        res.end('Proxy Error: ' + e.message);
    });

    req.pipe(proxyReq);
});

// HTTPS CONNECT tunnel
server.on('connect', (req, clientSocket, head) => {
    if (!isAuthorized(req.headers['proxy-authorization'])) {
        clientSocket.write(
            'HTTP/1.1 407 Proxy Authentication Required\r\n' +
            'Proxy-Authenticate: Basic realm="proxy"\r\n' +
            'Connection: close\r\n\r\n'
        );
        clientSocket.end();
        return;
    }

    const [host, portStr] = req.url.split(':');
    const port = parseInt(portStr, 10) || 443;

    const serverSocket = net.connect(port, host, () => {
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        serverSocket.write(head);
        serverSocket.pipe(clientSocket);
        clientSocket.pipe(serverSocket);
    });

    serverSocket.setTimeout(120000);
    clientSocket.setTimeout(120000);

    serverSocket.on('error', () => {
        try { clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n'); } catch (e) {}
        clientSocket.end();
    });

    clientSocket.on('error', () => {
        serverSocket.end();
    });

    serverSocket.on('timeout', () => {
        serverSocket.end();
        clientSocket.end();
    });
});

server.on('clientError', (err, socket) => {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});

server.listen(PORT, () => {
    console.log('Proxy running with CONNECT support on port ' + PORT);
});
