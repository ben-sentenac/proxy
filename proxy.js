import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import fs from 'node:fs';
import { URL } from 'node:url';

// Paths to certificate and key for HTTPS interception
const CERT_PATH = './cert.pem';
const KEY_PATH = './key.pem';

if (!fs.existsSync(CERT_PATH) || !fs.existsSync(KEY_PATH)) {
    console.error('Certificat ou clé introuvable ! Assurez-vous que les fichiers sont générés.');
    process.exit(1);
}

const privateKey = fs.readFileSync(KEY_PATH, 'utf8');
const certificate = fs.readFileSync(CERT_PATH, 'utf8');

// Global store for dynamically created HTTPS servers
const httpsServers = new Map();

// HTTP Proxy Server
const httpProxy = http.createServer((req, res) => {
    console.log(`[HTTP] Requête interceptée : ${req.method} ${req.url}`);

    const parsedUrl = new URL(req.url);
    const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || 80,
        path: parsedUrl.path,
        method: req.method,
        headers: req.headers,
    };

    const proxyReq = http.request(options, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
    });

    req.pipe(proxyReq);

    proxyReq.on('error', (err) => {
        console.error('[HTTP Proxy Error]', err.message);
        res.writeHead(500);
        res.end('Erreur dans le proxy HTTP.');
    });
});

// HTTPS CONNECT Handler
httpProxy.on('connect', (req, clientSocket, head) => {
    const [hostname, port] = req.url.split(':');
    console.log(`[HTTPS] Tunnel intercepté : ${hostname}:${port}`);

    // Create or reuse an HTTPS server for the hostname
    let httpsServer = httpsServers.get(hostname);
    if (!httpsServer) {
        httpsServer = https.createServer({
            key: privateKey,
            cert: certificate,
        }, (req, res) => {
            console.log(`[HTTPS] Requête interceptée : ${req.method} ${req.url}`);

            const parsedUrl = new URL(req.url);
            const options = {
                hostname: parsedUrl.hostname,
                port: parsedUrl.port || 443,
                path: parsedUrl.path,
                method: req.method,
                headers: req.headers,
            };

            const proxyReq = https.request(options, (proxyRes) => {
                res.writeHead(proxyRes.statusCode, proxyRes.headers);
                proxyRes.pipe(res);
            });

            req.pipe(proxyReq);

            proxyReq.on('error', (err) => {
                console.error('[HTTPS Proxy Error]', err.message);
                res.writeHead(500);
                res.end('Erreur dans le proxy HTTPS.');
            });
        });

        httpsServer.listen(0, () => {
            console.log(`[HTTPS] Serveur HTTPS prêt pour ${hostname} sur le port ${httpsServer.address().port}`);
            httpsServers.set(hostname, httpsServer);

            // Immediately handle queued requests after server starts
            handleHttpsConnection(httpsServer, clientSocket);
        });

        httpsServer.on('close', () => {
            httpsServers.delete(hostname);
        });

        httpsServer.on('error', (err) => {
            console.error(`[HTTPS Server Error for ${hostname}]`, err.message);
        });
    } else {
        // Handle connection if server already exists
        handleHttpsConnection(httpsServer, clientSocket);
    }
});

function handleHttpsConnection(httpsServer, clientSocket) {
    const targetPort = httpsServer.address().port;
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');

    const tunnel = net.connect(targetPort, 'localhost', () => {
        clientSocket.pipe(tunnel);
        tunnel.pipe(clientSocket);
    });

    tunnel.on('error', (err) => {
        console.error('[Tunnel Error]', err.message);
        clientSocket.end();
    });

    clientSocket.on('end', () => {
        console.log(`[HTTPS] Tunnel fermé.`);
    });
}

// Graceful Shutdown
process.on('SIGINT', () => {
    console.log('\nArrêt du proxy...');
    for (const [hostname, server] of httpsServers) {
        server.close();
    }
    process.exit();
});

// Start Proxy
httpProxy.listen(8080, () => {
    console.log('Proxy de sécurité en écoute:',httpProxy.address());
});
