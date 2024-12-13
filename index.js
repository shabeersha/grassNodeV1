const fs = require('fs');
const axios = require('axios');
const WebSocket = require('ws');
const uuid = require('uuid');
const randomUseragent = require('random-useragent');
const { SocksProxyAgent } = require('socks-proxy-agent'); // For SOCKS proxy
const { HttpProxyAgent } = require('http-proxy-agent'); // For HTTP proxy
const { setIntervalAsync } = require('set-interval-async/dynamic'); // For asynchronous intervals
const { clearIntervalAsync } = require('set-interval-async/dynamic'); // For clearing asynchronous intervals


// Helper function to choose the correct agent based on the proxy protocol
function getProxyAgent(proxyUrl) {
    if (proxyUrl.startsWith('socks5://') || proxyUrl.startsWith('socks4://')) {
        // Use SOCKS proxy
        return new SocksProxyAgent(proxyUrl);
    } else if (proxyUrl.startsWith('http://') || proxyUrl.startsWith('https://')) {
        // Use HTTP proxy
        return new HttpProxyAgent(proxyUrl);
    } else {
        throw new Error(`Unsupported proxy protocol: ${proxyUrl}`);
    }
}

async function fetchProxies() {
    const apiUrl = "https://raw.githubusercontent.com/proxifly/free-proxy-list/refs/heads/main/proxies/countries/CA/data.txt";

    try {
        const response = await axios.get(apiUrl);
        if (response.status === 200) {
            const proxies = response.data.trim().split('\n');
            if (proxies.length > 0) {
                fs.writeFileSync('auto_proxies.txt', proxies.join('\n'));
                console.log(`Fetched and saved ${proxies.length} proxies to 'auto_proxies.txt'.`);
                return true;
            } else {
                console.log("No proxies found from the API.");
                return false;
            }
        } else {
            console.log(`Failed to fetch proxies. Status code: ${response.status}`);
            return false;
        }
    } catch (e) {
        console.error(`Error fetching proxies: ${e}`);
        return false;
    }
}

async function connectToWSS(socks5Proxy, userId) {
    const randomUserAgent = randomUseragent.getRandom();

    const deviceId = uuid.v5(socks5Proxy, uuid.v5.DNS);

    console.log(`Device ID: ${deviceId}`);

    while (true) {
        try {
            await new Promise(resolve => setTimeout(resolve, Math.random() * 1000)); // Random delay

            const customHeaders = {
                "User-Agent": randomUserAgent,
            };

            const urilist = [
                "wss://proxy2.wynd.network:4444/",
                "wss://proxy2.wynd.network:4650/"
            ];

            const uri = urilist[Math.floor(Math.random() * urilist.length)];

            // Get the correct proxy agent based on the proxy URL
            const agent = getProxyAgent(socks5Proxy);

            const ws = new WebSocket(uri, {
                headers: customHeaders,
                agent: agent, // Use proxy agent here
            });

            ws.on('open', () => {
                console.log(`Connected to WebSocket at ${uri}`);

                const sendPing = setIntervalAsync(() => {
                    const pingMessage = JSON.stringify({
                        id: uuid.v4(),
                        version: "1.0.0",
                        action: "PING",
                        data: {}
                    });
                    console.log(pingMessage);
                    ws.send(pingMessage);
                }, 5000); // Send ping every 5 seconds

                ws.on('message', (data) => {
                    const message = JSON.parse(data);
                    console.log(message);

                    if (message.action === "AUTH") {
                        const authResponse = {
                            id: message.id,
                            origin_action: "AUTH",
                            result: {
                                browser_id: deviceId,
                                user_id: userId,
                                user_agent: customHeaders['User-Agent'],
                                timestamp: Math.floor(Date.now() / 1000),
                                device_type: "desktop",
                                version: "4.28.2",
                            }
                        };

                        console.log(authResponse);
                        ws.send(JSON.stringify(authResponse));
                    } else if (message.action === "PONG") {
                        const pongResponse = {
                            id: message.id,
                            origin_action: "PONG"
                        };

                        console.log(pongResponse);
                        ws.send(JSON.stringify(pongResponse));
                    }
                });

                ws.on('close', () => {
                    clearIntervalAsync(sendPing); // Stop sending pings when connection closes
                    console.log("WebSocket closed.");
                });
            });

            ws.on('error', (error) => {
                console.error(`WebSocket error: ${error}`);
                // Optionally, handle the error and remove proxy from file
                fs.readFile('auto_proxies.txt', 'utf-8', (err, data) => {
                    if (!err) {
                        const lines = data.split('\n');
                        const updatedLines = lines.filter(line => line !== socks5Proxy);
                        fs.writeFileSync('auto_proxies.txt', updatedLines.join('\n'));
                        console.log(`Proxy '${socks5Proxy}' has been removed from the file.`);
                    }
                });
            });
        } catch (e) {
            console.error(`Error connecting to WebSocket: ${e}`);
        }
    }
}

async function main() {

    let userId = "2pLVjlqArrDDi7QsQiqQTr8WxzW";
    let proxyList;
    try {
        // userId = fs.readFileSync('user_id.txt', 'utf-8').trim();
        if (!userId) {
            console.log("No user ID found in 'user_id.txt'.");
            return;
        }
        console.log(`User ID read from file: ${userId}`);
    } catch (err) {
        console.error("Error: 'user_id.txt' file not found.");
        return;
    }

    const proxiesFetched = await fetchProxies();
    if (!proxiesFetched) {
        console.log("No proxies available. Exiting script.");
        return;
    }

    try {
        proxyList = fs.readFileSync('auto_proxies.txt', 'utf-8').split('\n').filter(line => line.trim() !== '');
        if (proxyList.length === 0) {
            console.log("No proxies found in 'auto_proxies.txt'. Exiting script.");
            return;
        }
        console.log(`Proxies read from file: ${proxyList}`);
    } catch (err) {
        console.error("Error: 'auto_proxies.txt' file not found.");
        return;
    }

    for (const proxy of proxyList) {
        connectToWSS(proxy, userId);
    }
}

main();
