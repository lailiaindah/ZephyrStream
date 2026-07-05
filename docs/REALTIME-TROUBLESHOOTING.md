# Realtime Service Troubleshooting

If the footer shows **"Realtime Offline"** even though `sudo systemctl status zephystream-realtime` is active, the issue is almost always one of these:

## 1. Firewall blocking port 3003

The realtime service runs on port **3003** and the browser connects to it directly (in addition to the web app on port 3000). If your VPS firewall blocks port 3003, the browser cannot reach the Socket.io server.

### Check if the port is open

```bash
# On the VPS:
sudo ufw status
# Look for 3003 in the allowed list

# Or test from outside:
curl -s http://YOUR_VPS_IP:3003/health
# Should return: {"status":"ok","service":"zephystream-realtime"}
```

### Open port 3003

```bash
# UFW (Ubuntu/Debian default):
sudo ufw allow 3003/tcp
sudo ufw reload

# Or firewalld (CentOS/RHEL):
sudo firewall-cmd --permanent --add-port=3003/tcp
sudo firewall-cmd --reload

# Or iptables:
sudo iptables -A INPUT -p tcp --dport 3003 -j ACCEPT
```

### Cloud provider security group

If you're on AWS, GCP, Azure, DigitalOcean, etc., you also need to open port 3003 in the cloud provider's **security group / firewall rules** (the network-level firewall, not just the OS firewall).

## 2. Service is running but not listening on 0.0.0.0

The realtime service binds to all interfaces by default. Verify:

```bash
ss -tlnp | grep 3003
# Should show: LISTEN 0 511 *:3003  (the * means all interfaces)
# If it shows 127.0.0.1:3003, only localhost can reach it — check the service config
```

## 3. Browser cannot resolve the hostname

The frontend builds the Socket.io URL from `window.location.hostname` + port 3003. This means:

- If you access the app via `http://1.2.3.4:3000`, the browser will try `http://1.2.3.4:3003` — should work as long as port 3003 is open on the firewall.
- If you access via `https://yourdomain.com`, the browser will try `https://yourdomain.com:3003` — this requires TLS on port 3003 too (use a reverse proxy like Caddy or Nginx).
- If you access via `http://localhost:3000` (only on the VPS itself), the browser will try `http://localhost:3003` — should work fine.

## 4. Mixed content blocking (HTTPS page → HTTP socket)

If your web app is served over HTTPS but the realtime service is plain HTTP, browsers will block the connection as "mixed content". Symptoms:

- Browser console shows: "Mixed Content: ... was loaded over HTTPS, but requested an insecure resource"
- Realtime stays Offline forever

**Fix:** Put both services behind a reverse proxy (Caddy/Nginx) that terminates TLS. Example Caddyfile:

```
yourdomain.com {
  reverse_proxy /api/* localhost:3000
  reverse_proxy /socket.io/* localhost:3003
  reverse_proxy localhost:3000
}
```

Then access the app via `https://yourdomain.com` and the Socket.io connection will go through the same origin (no port 3003 needed in the URL).

## 5. Quick health check

```bash
# Service status
sudo systemctl status zephystream-realtime

# Health endpoint (from VPS)
curl -s http://localhost:3003/health

# Health endpoint (from outside VPS)
curl -s http://YOUR_VPS_IP:3003/health

# Check logs for errors
sudo journalctl -u zephystream-realtime -n 50 --no-pager
```

## 6. What "Realtime Offline" actually means

The app still works fully when Realtime is Offline — it just falls back to **HTTP polling**:
- Dashboard data refreshes every 10 seconds (via Tanstack Query)
- System stats refresh every 5 seconds
- Stream status updates within 30 seconds (via scheduler tick)

The Socket.io realtime service just makes these updates instant (sub-second) instead of polled. If you don't mind the slight delay, you can safely ignore the "Offline" status.

## Restart after firewall changes

If you opened port 3003 and it still doesn't work, restart the realtime service:

```bash
sudo systemctl restart zephystream-realtime
sudo systemctl status zephystream-realtime
```
