use serde::{Deserialize, Serialize};
use std::io::Write;
use std::net::SocketAddr;
use std::time::Instant;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ServerInfo {
    pub host: String,
    pub port: u16,
    pub ping_ms: Option<u64>,
    pub version_name: Option<String>,
    pub protocol: Option<i32>,
    pub online: Option<i32>,
    pub max: Option<i32>,
    pub description: Option<String>,
    pub favicon_data_url: Option<String>, // base64 PNG (data:image/png;base64,...)
    pub error: Option<String>,
}

/// Write a Minecraft protocol VarInt (little base-128).
fn write_varint<W: Write>(out: &mut W, value: i32) -> std::io::Result<()> {
    let mut val = value as u32;
    loop {
        let mut byte = (val & 0x7f) as u8;
        val >>= 7;
        if val != 0 {
            byte |= 0x80;
        }
        out.write_all(&[byte])?;
        if val == 0 {
            break;
        }
    }
    Ok(())
}

/// Read a VarInt from an in-memory byte slice. Returns (value, bytes_consumed).
fn read_varint_sync(buf: &[u8]) -> std::io::Result<(i32, usize)> {
    let mut result: i32 = 0;
    let mut consumed = 0usize;
    for shift in (0..35u32).step_by(7) {
        if consumed >= buf.len() {
            return Err(std::io::Error::new(std::io::ErrorKind::UnexpectedEof, "VarInt truncated"));
        }
        let byte = buf[consumed];
        consumed += 1;
        result |= ((byte & 0x7f) as i32) << shift;
        if byte & 0x80 == 0 {
            return Ok((result, consumed));
        }
    }
    Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "VarInt too big"))
}

fn write_mc_string<W: Write>(out: &mut W, value: &str) -> std::io::Result<()> {
    let bytes = value.as_bytes();
    write_varint(out, bytes.len() as i32)?;
    out.write_all(bytes)
}

#[derive(Deserialize)]
struct StatusResponse {
    version: Option<StatusVersion>,
    players: Option<StatusPlayers>,
    description: Option<serde_json::Value>,
    favicon: Option<String>,
}

#[derive(Deserialize)]
struct StatusVersion {
    name: Option<String>,
    protocol: Option<i32>,
}

#[derive(Deserialize)]
struct StatusPlayers {
    online: Option<i32>,
    max: Option<i32>,
}

fn extract_text(value: &serde_json::Value) -> Option<String> {
    match value {
        serde_json::Value::String(s) => Some(s.clone()),
        serde_json::Value::Object(map) => {
            if let Some(t) = map.get("text").and_then(|v| v.as_str()) {
                return Some(t.to_string());
            }
            if let Some(extra) = map.get("extra").and_then(|v| v.as_array()) {
                let mut buf = String::new();
                for part in extra {
                    if let Some(t) = extract_text(part) {
                        buf.push_str(&t);
                    }
                }
                if !buf.is_empty() {
                    return Some(buf);
                }
            }
            None
        }
        _ => None,
    }
}

async fn read_full(stream: &mut TcpStream, len: usize) -> std::io::Result<Vec<u8>> {
    let mut buf = vec![0u8; len];
    stream.read_exact(&mut buf).await?;
    Ok(buf)
}

#[tauri::command]
pub async fn ping_server(host: String, port: u16) -> Result<Vec<ServerInfo>, String> {
    match tokio::time::timeout(std::time::Duration::from_secs(5), ping_inner(host, port)).await {
        Ok(Ok(info)) => Ok(info),
        Ok(Err(e)) => Err(e),
        Err(_) => Err("Server ping timed out".to_string()),
    }
}

async fn ping_inner(host: String, port: u16) -> Result<Vec<ServerInfo>, String> {
    let (host, port) = match host.rsplit_once(':') {
        Some((h, p)) if h.contains('.') || h == "localhost" => (h.to_string(), p.parse().unwrap_or(port)),
        _ => (host, port),
    };

    let addr: SocketAddr = tokio::net::lookup_host((host.as_str(), port))
        .await
        .map_err(|e| format!("Cannot resolve {host}:{port}: {e}"))?
        .next()
        .ok_or_else(|| format!("No address for {host}:{port}"))?;

    let began = Instant::now();
    let mut stream = TcpStream::connect(addr).await.map_err(|e| format!("Connect failed: {e}"))?;
    let _ = stream.set_nodelay(true);

    // Handshake
    let mut handshake: Vec<u8> = Vec::new();
    write_varint(&mut handshake, 0x00).map_err(|e| format!("VarInt write: {e}"))?;
    write_varint(&mut handshake, 760).map_err(|e| format!("VarInt write: {e}"))?;
    write_mc_string(&mut handshake, &host).map_err(|e| format!("String write: {e}"))?;
    handshake.extend_from_slice(&port.to_be_bytes());
    write_varint(&mut handshake, 1).map_err(|e| format!("VarInt write: {e}"))?;

    let mut frame = Vec::new();
    write_varint(&mut frame, handshake.len() as i32).map_err(|e| format!("Frame varint: {e}"))?;
    frame.extend_from_slice(&handshake);
    stream.write_all(&frame).await.map_err(|e| format!("Handshake write failed: {e}"))?;

    // Status request
    stream.write_all(&[0x01u8]).await.map_err(|e| format!("Status request failed: {e}"))?;

    // Response
    let mut len_buf = Vec::new();
    for _ in 0..5 {
        let byte = stream.read_u8().await.map_err(|e| format!("Read length failed: {e}"))?;
        len_buf.push(byte);
        if byte & 0x80 == 0 {
            break;
        }
    }
    let len = read_varint_sync(&len_buf).map(|(v, _)| v).map_err(|e| format!("Bad length varint: {e}"))?;
    if len <= 0 || len > 1_048_576 {
        return Err(format!("Invalid response length {len}"));
    }
    let payload = read_full(&mut stream, len as usize).await.map_err(|e| format!("Read payload failed: {e}"))?;
    if payload.first() != Some(&0x00) {
        return Err("Unexpected status packet id".to_string());
    }
    let (str_len, consumed) = read_varint_sync(&payload[1..]).map_err(|e| format!("Bad string length: {e}"))?;
    let body = &payload[1 + consumed..];
    if str_len <= 0 || str_len as usize > body.len() {
        return Err("Bad string length".to_string());
    }
    let json = String::from_utf8(body[..str_len as usize].to_vec()).map_err(|e| format!("Invalid status JSON: {e}"))?;
    let parsed: StatusResponse = serde_json::from_str(&json).map_err(|e| format!("Malformed status: {e}"))?;

    let ping_ms = began.elapsed().as_millis() as u64;
    let description = parsed
        .description
        .as_ref()
        .and_then(extract_text)
        .map(|text| text.replace('\n', " · "));

    let (version_name, protocol) = match parsed.version {
        Some(v) => (v.name, v.protocol),
        None => (None, None),
    };
    let (online, max) = match parsed.players {
        Some(p) => (p.online, p.max),
        None => (None, None),
    };

    Ok(vec![ServerInfo {
        host,
        port,
        ping_ms: Some(ping_ms),
        version_name,
        protocol,
        online,
        max,
        description,
        favicon_data_url: parsed.favicon,
        error: None,
    }])
}