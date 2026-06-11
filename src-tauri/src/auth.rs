

use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::webview::WebviewWindowBuilder;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl};
use tokio::sync::oneshot;

const MS_CLIENT_ID: &str = "00000000402b5328";
const MS_AUTH_URL: &str = "https://login.live.com/oauth20_authorize.srf";
const MS_TOKEN_URL: &str = "https://login.live.com/oauth20_token.srf";
const XBL_AUTH_URL: &str = "https://user.auth.xboxlive.com/user/authenticate";
const XSTS_AUTH_URL: &str = "https://xsts.auth.xboxlive.com/xsts/authorize";
const MC_AUTH_URL: &str = "https://api.minecraftservices.com/authentication/login_with_xbox";
const MC_PROFILE_URL: &str = "https://api.minecraftservices.com/minecraft/profile";
const REDIRECT_URI: &str = "https://login.live.com/oauth20_desktop.srf";
const AUTH_WINDOW_LABEL: &str = "msa-auth";

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct MsaAccount {
    pub uuid: String,
    pub username: String,
    pub mc_access_token: String,
    pub refresh_token: String,
    pub expires_at: u64,
}

fn account_path(app: &AppHandle) -> PathBuf {
    let dir = app.path().app_config_dir().expect("config dir");
    let _ = std::fs::create_dir_all(&dir);
    dir.join("account.json")
}

fn save_account_file(app: &AppHandle, acc: &MsaAccount) -> Result<(), String> {
    let path = account_path(app);
    let data = serde_json::to_string_pretty(acc).map_err(|e| e.to_string())?;
    std::fs::write(&path, data).map_err(|e| e.to_string())
}

pub fn load_account_file(app: &AppHandle) -> Option<MsaAccount> {
    let data = std::fs::read_to_string(account_path(app)).ok()?;
    serde_json::from_str(&data).ok()
}

fn delete_account_file(app: &AppHandle) {
    let _ = std::fs::remove_file(account_path(app));
}

fn now_unix() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

fn format_uuid_with_dashes(no_dashes: &str) -> String {
    if no_dashes.len() != 32 || no_dashes.contains('-') {
        return no_dashes.to_string();
    }
    format!(
        "{}-{}-{}-{}-{}",
        &no_dashes[0..8], &no_dashes[8..12], &no_dashes[12..16],
        &no_dashes[16..20], &no_dashes[20..32]
    )
}

fn build_msa_authorize_url() -> String {
    let mut u = url::Url::parse(MS_AUTH_URL).expect("valid url");
    u.query_pairs_mut()
        .append_pair("client_id", MS_CLIENT_ID)
        .append_pair("response_type", "code")
        .append_pair("scope", "XboxLive.signin XboxLive.offline_access")
        .append_pair("redirect_uri", REDIRECT_URI)
        .append_pair("prompt", "select_account");
    u.into()
}

struct MsTokens {
    access_token: String,
    refresh_token: String,
    expires_in: u64,
}

async fn ms_token_exchange(
    client: &reqwest::Client,
    grant: &[(&str, &str)],
) -> Result<MsTokens, String> {
    let res: serde_json::Value = client
        .post(MS_TOKEN_URL)
        .form(grant)
        .send().await.map_err(|e| format!("MS token request failed: {e}"))?
        .json().await.map_err(|e| format!("MS token response not JSON: {e}"))?;
    let access_token = res["access_token"].as_str()
        .ok_or_else(|| format!("MS token: no access_token: {res}"))?
        .to_string();
    let refresh_token = res["refresh_token"].as_str().unwrap_or("").to_string();
    let expires_in = res["expires_in"].as_u64().unwrap_or(86400);
    Ok(MsTokens { access_token, refresh_token, expires_in })
}

async fn ms_exchange_code(client: &reqwest::Client, code: &str) -> Result<MsTokens, String> {
    ms_token_exchange(client, &[
        ("client_id", MS_CLIENT_ID),
        ("code", code),
        ("grant_type", "authorization_code"),
        ("redirect_uri", REDIRECT_URI),
    ]).await
}

async fn ms_refresh(client: &reqwest::Client, refresh_token: &str) -> Result<MsTokens, String> {
    ms_token_exchange(client, &[
        ("client_id", MS_CLIENT_ID),
        ("refresh_token", refresh_token),
        ("grant_type", "refresh_token"),
        ("redirect_uri", REDIRECT_URI),
    ]).await
}

async fn xbl_auth(client: &reqwest::Client, ms_access: &str) -> Result<(String, String), String> {
    let body = serde_json::json!({
        "Properties": {
            "AuthMethod": "RPS",
            "SiteName": "user.auth.xboxlive.com",
            "RpsTicket": format!("d={}", ms_access),
        },
        "RelyingParty": "http://auth.xboxlive.com",
        "TokenType": "JWT",
    });
    let res: serde_json::Value = client.post(XBL_AUTH_URL)
        .header("Accept", "application/json")
        .json(&body)
        .send().await.map_err(|e| format!("XBL request failed: {e}"))?
        .json().await.map_err(|e| format!("XBL response not JSON: {e}"))?;
    let token = res["Token"].as_str()
        .ok_or_else(|| format!("XBL: no Token: {res}"))?.to_string();
    let user_hash = res["DisplayClaims"]["xui"][0]["uhs"].as_str()
        .ok_or("XBL: no userHash")?.to_string();
    Ok((token, user_hash))
}

async fn xsts_auth(client: &reqwest::Client, xbl_token: &str) -> Result<String, String> {
    let body = serde_json::json!({
        "Properties": { "SandboxId": "RETAIL", "UserTokens": [xbl_token] },
        "RelyingParty": "rp://api.minecraftservices.com/",
        "TokenType": "JWT",
    });
    let res: serde_json::Value = client.post(XSTS_AUTH_URL)
        .header("Accept", "application/json")
        .json(&body)
        .send().await.map_err(|e| format!("XSTS request failed: {e}"))?
        .json().await.map_err(|e| format!("XSTS response not JSON: {e}"))?;
    if let Some(token) = res["Token"].as_str() { return Ok(token.to_string()); }
    if let Some(err) = res["XErr"].as_u64() {
        return Err(match err {
            2148916233 => "This Microsoft account has no Xbox profile. Create one at xbox.com.".into(),
            2148916235 => "Xbox Live is not available in your country/region.".into(),
            2148916238 => "This is a child account. Add it to a Family at xbox.com.".into(),
            _ => format!("XSTS auth failed (XErr {err})"),
        });
    }
    Err(format!("XSTS auth failed: {res}"))
}

async fn mc_auth(client: &reqwest::Client, xsts: &str, user_hash: &str) -> Result<String, String> {
    let body = serde_json::json!({
        "identityToken": format!("XBL3.0 x={};{}", user_hash, xsts),
    });
    let res: serde_json::Value = client.post(MC_AUTH_URL)
        .header("Accept", "application/json")
        .json(&body)
        .send().await.map_err(|e| format!("MC auth request failed: {e}"))?
        .json().await.map_err(|e| format!("MC auth response not JSON: {e}"))?;
    res["access_token"].as_str().map(String::from)
        .ok_or_else(|| format!("MC auth: no access_token: {res}"))
}

async fn mc_profile(client: &reqwest::Client, token: &str) -> Result<(String, String), String> {
    let res: serde_json::Value = client.get(MC_PROFILE_URL)
        .header("Authorization", format!("Bearer {token}"))
        .send().await.map_err(|e| format!("MC profile request failed: {e}"))?
        .json().await.map_err(|e| format!("MC profile response not JSON: {e}"))?;
    let id = res["id"].as_str()
        .ok_or("Could not fetch profile. Make sure this account owns Minecraft Java Edition.")?.to_string();
    let name = res["name"].as_str()
        .ok_or("MC profile: no name")?.to_string();
    Ok((id, name))
}

async fn full_auth_from_code(client: &reqwest::Client, code: &str) -> Result<MsaAccount, String> {
    let ms = ms_exchange_code(client, code).await?;
    let (xbl, uh) = xbl_auth(client, &ms.access_token).await?;
    let xsts = xsts_auth(client, &xbl).await?;
    let mc = mc_auth(client, &xsts, &uh).await?;
    let (id, name) = mc_profile(client, &mc).await?;
    Ok(MsaAccount {
        uuid: format_uuid_with_dashes(&id),
        username: name,
        mc_access_token: mc,
        refresh_token: ms.refresh_token,
        expires_at: now_unix() + ms.expires_in,
    })
}

async fn full_auth_from_refresh(client: &reqwest::Client, old: &str) -> Result<MsaAccount, String> {
    let ms = ms_refresh(client, old).await?;
    let (xbl, uh) = xbl_auth(client, &ms.access_token).await?;
    let xsts = xsts_auth(client, &xbl).await?;
    let mc = mc_auth(client, &xsts, &uh).await?;
    let (id, name) = mc_profile(client, &mc).await?;
    let new_refresh = if ms.refresh_token.is_empty() { old.to_string() } else { ms.refresh_token };
    Ok(MsaAccount {
        uuid: format_uuid_with_dashes(&id),
        username: name,
        mc_access_token: mc,
        refresh_token: new_refresh,
        expires_at: now_unix() + ms.expires_in,
    })
}

#[tauri::command]
pub async fn msa_login(app: AppHandle) -> Result<MsaAccount, String> {
    if let Some(w) = app.get_webview_window(AUTH_WINDOW_LABEL) {
        let _ = w.close();
    }

    let (tx, rx) = oneshot::channel::<Result<String, String>>();
    let tx = Arc::new(Mutex::new(Some(tx)));

    let auth_url = build_msa_authorize_url();
    let parsed = url::Url::parse(&auth_url).map_err(|e| e.to_string())?;

    let tx_nav = tx.clone();
    let window = WebviewWindowBuilder::new(&app, AUTH_WINDOW_LABEL, WebviewUrl::External(parsed))
        .title("Sign in with Microsoft")
        .inner_size(520.0, 720.0)
        .center()
        .resizable(true)
        .on_navigation(move |url| {
            if url.as_str().starts_with(REDIRECT_URI) {
                let mut code: Option<String> = None;
                let mut err: Option<String> = None;
                for (k, v) in url.query_pairs() {
                    if k == "code" { code = Some(v.into_owned()); }
                    else if k == "error" || k == "error_description" { err = Some(v.into_owned()); }
                }
                let result = match code {
                    Some(c) => Ok(c),
                    None => Err(err.unwrap_or_else(|| "no auth code returned".into())),
                };
                if let Ok(mut g) = tx_nav.lock() {
                    if let Some(s) = g.take() { let _ = s.send(result); }
                }
                return false;
            }
            true
        })
        .build()
        .map_err(|e| format!("Could not open auth window: {e}"))?;

    let tx_close = tx.clone();
    window.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::Destroyed) {
            if let Ok(mut g) = tx_close.lock() {
                if let Some(s) = g.take() { let _ = s.send(Err("Login cancelled".into())); }
            }
        }
    });

    let code = rx.await
        .map_err(|_| "Auth window closed without response".to_string())??;

    if let Some(w) = app.get_webview_window(AUTH_WINDOW_LABEL) {
        let _ = w.close();
    }

    let client = reqwest::Client::new();
    let acc = full_auth_from_code(&client, &code).await?;
    save_account_file(&app, &acc)?;
    let _ = app.emit("auth-changed", &acc);
    Ok(acc)
}

#[tauri::command]
pub async fn msa_logout(app: AppHandle) -> Result<(), String> {
    delete_account_file(&app);
    let _ = app.emit("auth-changed", serde_json::Value::Null);
    Ok(())
}

#[tauri::command]
pub async fn get_account(app: AppHandle) -> Option<MsaAccount> {
    let mut acc = load_account_file(&app)?;
    if now_unix() + 600 >= acc.expires_at {
        let client = reqwest::Client::new();
        if let Ok(refreshed) = full_auth_from_refresh(&client, &acc.refresh_token).await {
            let _ = save_account_file(&app, &refreshed);
            let _ = app.emit("auth-changed", &refreshed);
            acc = refreshed;
        }
    }
    Some(acc)
}
